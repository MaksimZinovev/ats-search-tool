// lib.mjs — shared logic: platforms, query building, Brave search (paged), second search channel.
// Self-check (no network): node lib.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const PLATFORMS = [
  ["ashby", "Ashby", "jobs.ashbyhq.com"],
  ["greenhouse", "Greenhouse", "boards.greenhouse.io"],
  ["lever", "Lever", "jobs.lever.co"],
  ["icims", "iCIMS", "careers.icims.com"],
  ["jobvite", "Jobvite", "jobs.jobvite.com"],
  ["workday", "Workday (wd1)", "wd1.myworkdayjobs.com"],
  ["workday3", "Workday (wd3)", "wd3.myworkdayjobs.com"],
  ["bamboohr", "BambooHR", "jobs.bamboohr.com"],
  ["smartrecruiters", "SmartRecruiters", "jobs.smartrecruiters.com"],
  ["jazzhr", "JazzHR", "apply.jazz.co"],
  ["workable", "Workable", "careers.workable.com"],
  ["gem", "Gem", "jobs.gem.com"],
  ["wttj", "Welcome to the Jungle", "welcometothejungle.com"],
  ["teamtailor", "Teamtailor", "jobs.teamtailor.com"],
  ["recruitee", "Recruitee", "jobs.recruitee.com"],
  ["breezy", "Breezy", "jobs.breezy.hr"],
  ["pinpoint", "Pinpoint", "jobs.pinpointhq.com"],
  ["homerun", "Homerun", "apply.homerun.co"],
  // AU region — obscure direct-employer sources (state gov, PageUp unis, local ATSs).
  // Vetted empirically: Brave-indexed per-posting pages; verify-pass fetchability noted in PROGRESS.md.
  ["qldgov", "QLD Gov Jobs", "smartjobs.qld.gov.au", "AU · QLD"],
  ["nswgov", "NSW Gov Jobs", "iworkfor.nsw.gov.au", "AU · NSW"],
  ["wagov", "WA Gov Jobs", "jobs.wa.gov.au", "AU · WA"],
  ["tasgov", "TAS Gov Jobs", "jobs.tas.gov.au", "AU · TAS"],
  ["ntgov", "NT Gov Jobs", "jobs.nt.gov.au", "AU · NT"],
  ["unimelb", "UniMelb", "jobs.unimelb.edu.au", "AU · VIC"],
  ["unsw", "UNSW", "external-careers.jobs.unsw.edu.au", "AU · NSW"],
  ["anu", "ANU", "jobs.anu.edu.au", "AU · ACT"],
  ["livehire", "LiveHire", "livehire.com", "AU"],
  ["employmenthero", "Employment Hero", "employmenthero.com", "AU"],
  ["ethicaljobs", "EthicalJobs", "ethicaljobs.com.au", "AU"],
].map(([id, name, domain, region]) => ({ id, name, domain, region: region || "", builtin: true, hidden: false }));

export function buildQuery(domain, keywords, location, orMode) {
  const kw = (keywords || "").trim();
  let terms;
  if (orMode && kw.includes(",")) {
    terms = kw.split(",").map((t) => t.trim()).filter(Boolean).map((t) => `"${t}"`).join(" OR ");
  } else {
    terms = `"${kw.replace(/"/g, "")}"`;
  }
  const loc = (location || "").trim();
  return `site:${domain} ${terms}${loc ? " " + loc : ""}`;
}

export const braveUrl = (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`;
export const googleUrl = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

// ---- second search channel: Ollama Cloud web search ----
// ponytail: this is a search endpoint, not an LLM — no model, no prompt, no tokens, no cost.
// It hands back the page as text, which is also how a posting behind a bot wall becomes readable.
export const DEFAULT_WATCH = [
  { domain: "jobmesh.io", name: "jobmesh.io" },
  { domain: "jobs-au.jobflurry.com", name: "jobflurry.com" },
  { domain: "au.thebigjobsite.com", name: "thebigjobsite.com" },
  { domain: "www.jobleads.com", name: "jobleads.com" },
];

// The watch list is data, not code: config.json wins when it is there, defaults when it is not.
export function loadWatch(path) {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const list = Array.isArray(raw?.watch) ? raw.watch : [];
    const clean = list
      .map((x) => ({ domain: String(x?.domain || "").trim(), name: String(x?.name || x?.domain || "").trim() }))
      .filter((x) => x.domain);
    if (clean.length) return clean;
  } catch { /* no file, unreadable, or no watch list: fall through to the defaults */ }
  return DEFAULT_WATCH;
}

// The boards print the fields as plain text; read them where they are, no model needed.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function boardMeta(content, rawTitle = "") {
  const t = String(content || "");
  const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);
  let loc = (t.match(/Location\n([^\n]+)/) || [])[1] || "";
  if (!loc) {
    const l2 = lines[1] || "";
    if (l2 && !l2.startsWith("#") && !l2.includes(":") && l2.length <= 60) loc = l2;
  }
  if (!loc) {
    const m = String(rawTitle).split(" | ")[0].match(/\bin\s+([^,|]+)$/i); // the board appends " In <place>"
    if (m) loc = m[1].trim();
  }
  // the boards print "place / work type" — "Sydney / Global", "Sydney / On-site". Only the place is the place.
  loc = loc.split("/")[0].trim();
  const d = (t.match(/Online since\n(\d{1,2})\/(\d{1,2})\/(\d{4})/) || []).slice(1);
  let employer = "";
  const head = t.match(/^#\s+(.+)$/m); // the title the board prints, then the employer under it
  if (head) {
    const next = t.slice(head.index + head[0].length).split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
    if (next && !/^[#\-*•]/.test(next) && !next.includes(":") && !next.includes(",") && next.length <= 60) employer = next;
  }
  return { location: loc.trim(), employer, posted: d.length ? `${+d[1]} ${MONTHS[+d[0] - 1]}` : "" };
}
export function boardTitle(raw, loc) {
  let t = String(raw || "").split(" | ")[0].trim(); // boards append their own name
  const l = String(loc || "").split(/[,/]/)[0].trim();
  if (l) t = t.replace(new RegExp("\\s+in\\s+" + l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"), "").trim();
  return t;
}
// The words of the posting itself: what the page says after its job-description heading.
function boardBody(content) {
  const t = String(content || "");
  const m = t.match(/#{1,3}\s*job description/i);
  return (m ? t.slice(m.index + m[0].length) : t).replace(/\s+/g, " ").trim();
}
// A short fingerprint of the job description: the same role on two boards has the same one,
// two different roles with the same title do not. It is what keeps one role from swallowing another.
export function boardFingerprint(content) {
  return norm(boardBody(content)).slice(0, 120);
}
// A board row with no employer still has to say what it is: the posting's own first words,
// cut at a word boundary. It quotes the page, so it cannot be wrong.
export function boardQuote(content, chars = 90) {
  const body = boardBody(content);
  if (body.length <= chars) return body;
  const cut = body.slice(0, chars);
  const i = cut.lastIndexOf(" ");
  return (i > 20 ? cut.slice(0, i) : cut).replace(/[,;:.\-]+$/, "") + "…";
}
export function boardKey(title, loc, fingerprint) { // one role, one row: title + place + what the page says
  return [norm(title), norm(String(loc || "").split(/[,/]/)[0]), norm(fingerprint)].join("|");
}

export async function secondSearch(query, key, max = 10) {
  const r = await fetch("https://ollama.com/api/web_search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: Math.min(Math.max(max, 1), 10) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`second ${r.status}`);
  const j = await r.json();
  const results = (j.results || []).map((x) => {
    const meta = boardMeta(x.content, x.title);
    const title = boardTitle(x.title, meta.location);
    return { title, url: x.url || "", content: x.content || "", ...meta, quote: boardQuote(x.content), key: boardKey(title, meta.location, boardFingerprint(x.content)) };
  });
  return { count: results.length, results };
}

// The board's copy of a page in the search index can be older than the posting:
// a job that closed last week still reads like a live one. So ask the provider
// for the page itself, and say plainly what we could not confirm.
const GONE = /no longer available|no longer open|no longer accepting|this (job|role|position) (is|has) (closed|expired|filled)|job (is )?no longer/i;
const jobmeshApply = (url) => {
  const m = String(url).match(/^https?:\/\/jobmesh\.io\/job\/([0-9a-f-]+)/i);
  return m ? `https://jmmst.com/${m[1]}` : null; // the page the board's Apply button goes to
};

async function providerFetch(url, key) {
  const r = await fetch("https://ollama.com/api/web_fetch", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return { ok: false, status: r.status };
  const j = await r.json().catch(() => ({}));
  return { ok: true, content: String(j.content || "") };
}

// "live" = the page is there now. "gone" = the board says the job is no longer
// available. "unknown" = we could not fetch it, which is not the same thing.
export async function checkPostings(urls, key) {
  return Promise.all(urls.map(async (url) => {
    let state = "unknown";
    try {
      const r = await providerFetch(url, key);
      if (r.ok) state = GONE.test(r.content) ? "gone" : "live";
      else if (r.status === 404) {
        const alt = jobmeshApply(url);
        if (alt) {
          const r2 = await providerFetch(alt, key);
          if (r2.ok) state = GONE.test(r2.content) ? "gone" : "live";
        }
      }
    } catch { state = "unknown"; }
    return { url, state };
  }));
}

async function bravePage(query, key, offset) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&offset=${offset}`;
  // ponytail: one 429 retry with 1.2s backoff; real queue if heavy use ever needs it
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { "X-Subscription-Token": key, Accept: "application/json" } });
    if (r.status === 429 && attempt === 0) {
      await new Promise((s) => setTimeout(s, 1200));
      continue;
    }
    if (!r.ok) throw new Error(`brave ${r.status}`);
    const j = await r.json();
    const results = (j.web?.results || []).map((x) => ({
      title: x.title || "",
      url: x.url || "",
      description: x.description || "",
    }));
    return { results, more: !!j.query?.more_results_available };
  }
}

// Paged Brave search: exact count up to MAX_PAGES*20, then "capped"=true → UI shows "60+".
// ponytail: Bing-HTML totals proved garbage server-side (site: ignored, 65→6570 across runs,
// unrelated results), so paging Brave — the API we already trust — replaces the hybrid plan.
export async function braveSearch(query, key, MAX_PAGES = 3) {
  const all = [];
  let more = true;
  for (let offset = 0; offset < MAX_PAGES && more; offset++) {
    const page = await bravePage(query, key, offset);
    all.push(...page.results);
    more = page.more && page.results.length === 20;
    if (offset < MAX_PAGES - 1 && more) await new Promise((s) => setTimeout(s, 350)); // free tier ≈1qps
  }
  return { count: all.length, capped: more, results: all };
}

// ---- self-check: node lib.mjs (pure functions only, no network) ----
if (process.argv[1]?.endsWith("lib.mjs")) {
  assert.equal(buildQuery("jobs.ashbyhq.com", "product designer", "remote", false),
    'site:jobs.ashbyhq.com "product designer" remote');
  assert.equal(buildQuery("jobs.lever.co", "qa, software tester", "", true),
    'site:jobs.lever.co "qa" OR "software tester"');
  assert.equal(buildQuery("x.com", 'weird "quotes"', "  ", false), 'site:x.com "weird quotes"');
  assert.equal(buildQuery("x.com", "engineer", "Sydney", true), 'site:x.com "engineer" Sydney');
  assert.ok(braveUrl("a b").endsWith(encodeURIComponent("a b")));
  // second channel: watch list falls back to the defaults, and keeps the config's shape
  assert.deepEqual(loadWatch("/nonexistent/config.json"), DEFAULT_WATCH);
  assert.equal(loadWatch("/nonexistent/config.json")[1].name, "jobflurry.com");
  // a board page: the fields the boards print, read straight out of the text
  const sample = "Find jobs\n\nApply now\n\n---\n\n## At a glance\n\nLocation\nSydney, New South Wales\n\nOnline since\n10/19/2026\n\n# Quality Assurance Engineer\n\nCove\n\nSydney, New South Wales\n\n## Job description\n\nCove is the operating entity for Deck2 Capital.";
  const meta = boardMeta(sample, "Quality Assurance Engineer");
  assert.equal(meta.location, "Sydney, New South Wales");
  assert.equal(meta.employer, "Cove");
  assert.equal(meta.posted, "19 Oct");
  assert.equal(boardTitle("Quality Assurance Engineer In Sydney | TheBigJobsite.com", "Sydney / Global"), "Quality Assurance Engineer");
  // a board prints "place / work type": only the place is the place
  assert.equal(boardMeta("Quality Assurance Engineer In Sydney | TheBigJobsite.com\n\nSydney / Global\n\n## Job Description\n\nbody").location, "Sydney");
  assert.equal(boardKey("Quality Assurance Engineer", "Sydney, New South Wales", "cove is the operating entity"), "quality assurance engineer|sydney|cove is the operating entity");
  // a board page with nothing under the title: no employer, no guess
  assert.equal(boardMeta("Editorial AI QA Engineer In Sydney | TheBigJobsite.com\n\nSydney / Global\n\n# Editorial AI QA Engineer\n\n## Job Summary\n\nWork Settings:\n").employer, "");
  // a work-arrangement line is not an employer, and a heading is not a place
  assert.equal(boardMeta("ICT QA Engineer In Sydney | TheBigJobsite.com\n\n## Job Description\n\nbody", "ICT QA Engineer In Sydney | TheBigJobsite.com").location, "Sydney");
  assert.equal(boardMeta("ICT QA Engineer In Sydney | TheBigJobsite.com\n\nSydney / Global\n\n# ICT QA Engineer\n\n- Hybrid\n\n## Job Description\n\nbody").employer, "");
  // the same role on two boards has the same fingerprint, two different roles do not
  assert.equal(boardFingerprint("## Job Description\n\nCove is the operating entity for Deck2 Capital. Together, we buy."), boardFingerprint("## Job description\n\nCove is the operating entity for Deck2 Capital. Together, we buy."));
  assert.notEqual(boardFingerprint("## Job Description\n\nCove is the operating entity for Deck2 Capital."), boardFingerprint("## Job Description\n\nMST is seeking an experienced Quality Assurance Engineer."));
  // a row with no employer still quotes the posting itself
  assert.equal(boardQuote("## Job Description\n\nWe are seeking an experienced Quality Assurance Engineer to help ensure the quality, reliability and release readiness of MST's platforms."), "We are seeking an experienced Quality Assurance Engineer to help ensure the quality…");
  assert.equal(boardQuote("## Job Description\n\nShort body."), "Short body.");
  console.log("lib self-check OK");
}