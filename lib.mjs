// lib.mjs — shared logic: platforms, query building, Brave search (paged), second search channel.
// Self-check (no network): node lib.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import cp from "node:child_process";
const { execFile, execFileSync } = cp; // both used plain; execFile wrapped in a promise above

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

// ponytail: the boards keep working past one weak engine — Ollama first, then Bright Data's
// Google index, then the Brave channel the rows already use; a 0-result answer is walked past too.
export async function secondSearch(query, key, max = 10) {
  // An engine that answers 0 is walked past, the same as a failed one: the next
  // engine in the line may have crawled the posting this one has not. Only when
  // every engine in .env has answered 0 (or errored) does the search come back
  // empty — and then "all engines found nothing" is the truthful answer to show.
  const zeros = [], errors = [];
  const tries = [
    // each engine joins only when its key exists — the other two gate the same way below
    key ? () => ollamaSearch(query, key, max) : null,
    process.env.BRIGHTDATA_SERP_API_KEY ? () => brightDataSearch(query, process.env.BRIGHTDATA_SERP_API_KEY, max) : null,
    // Brave names the field "description" and its paged count is pages, so map, slice and recount
    process.env.BRAVE_API_KEY ? async () => {
      const r = await braveSearch(query, process.env.BRAVE_API_KEY);
      const results = mapBoardRows(r.results.slice(0, max).map((x) => ({ title: x.title, url: x.url, content: x.description })));
      return { count: results.length, results };
    } : null,
  ].filter(Boolean);
  for (const t of tries) {
    try {
      const r = await t();
      if (r.results.length) return r;
      zeros.push(r);
    } catch (e) { errors.push(String(e.message || e)); }
  }
  if (zeros.length) return zeros[0];
  throw new Error(errors.length ? errors[errors.length - 1] : "no search provider configured");
}

async function ollamaSearch(query, key, max = 10) {
  const r = await fetch("https://ollama.com/api/web_search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: Math.min(Math.max(max, 1), 10) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`second ${r.status}`);
  const j = await r.json();
  return { count: (j.results || []).length, results: mapBoardRows(j.results || []) };
}

// Every provider's rows go through the same mapper, so whatever answered, the
// boards read the same fields: parsed location/employer/date, a quote, a de-dup key.
const mapBoardRows = (rows) => (rows || []).map((x) => {
  const meta = boardMeta(x.content, x.title);
  const title = boardTitle(x.title, meta.location);
  return { title, url: x.url || "", content: x.content || "", ...meta, quote: boardQuote(x.content), key: boardKey(title, meta.location, boardFingerprint(x.content)) };
});

export async function brightDataSearch(query, key, max = 10) {
  // Bright Data SERP API: one POST to /request carrying a Google search URL.
  // key is the SERP API key; the zone name comes from BRIGHTDATA_SERP_ZONE (default "serp_api1").
  // data_format "parsed_light" returns { organic: [{ title, link, description }] }, twice as fast as full JSON.
  const zone = process.env.BRIGHTDATA_SERP_ZONE || "serp_api1";
  const num = Math.min(Math.max(max, 1), 10);
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&gl=au&hl=en`;
  const r = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ zone, url: googleUrl, format: "json", data_format: "parsed_light" }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`brightdata ${r.status}`);
  const j = await r.json();
  // Response is { status_code, headers, body } where body is a JSON string
  const data = typeof j.body === "string" ? JSON.parse(j.body) : j.body;
  // Parsed Light JSON: { organic: [{ title, link, description, ... }, ...] }
  const results = mapBoardRows((data.organic || []).map((x) => ({ title: x.title || "", url: x.link || "", content: x.description || "" })));
  return { count: results.length, results };
}

// The board's copy of a page in the search index can be older than the posting:
// a job that closed last week still reads like a live one. So read the page
// itself, and say plainly what we could and could not confirm.
const GONE = /no longer available|no longer open|no longer accepting|taken offline|this (job|role|position) (is|has) (closed|expired|filled)|job (is )?no longer/i;
const jobmeshApply = (url) => {
  const m = String(url).match(/^https?:\/\/jobmesh\.io\/job\/([0-9a-f-]+)/i);
  return m ? `https://jmmst.com/${m[1]}` : null; // the page the board's Apply button goes to
};

// HTML to readable text: enough for the gone phrases and for the posting's own
// fields to reach the grader, without depending on an extraction package.
const stripHtml = (html) => String(html || "")
  .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, "\"")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, 12000);

// One page read past more than the Ollama fetcher: the free GET first (every
// reader it satisfies protects the quota), Ollama second (the key is already in
// .env, no process spawn), a locally installed lightpanda third (it renders like
// a person, past bot walls, in about a second). The first tier that reads the
// page wins; a bare 404 from a tier that really read the page is the verdict too.
const FETCH_UAS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (docpull/2.0)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
];
const WALL = /challenges\.cloudflare|just a moment|attention required|verify you are human/i;

async function plainGet(url) {
  for (const ua of FETCH_UAS) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      const body = await r.text();
      if (WALL.test(body)) continue; // a challenge wears any status; it is not a verdict
      if (r.ok) return { ok: true, content: stripHtml(body) };
      if (r.status === 404 || r.status === 410) return { ok: false, status: r.status, final404: true }; // the origin says gone
      continue; // 403/429/5xx and friends are blocked or transient, try the next reader
    } catch { continue; }
  }
  return null;
}

async function ollamaFetch(url, key) {
  if (!key) return null;
  try {
    const r = await fetch("https://ollama.com/api/web_fetch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(20000),
    });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const content = String(j.content || "").trim();
      if (WALL.test(content)) return null; // a bot challenge wears any status; the next reader takes over
      return content.length > 40 ? { ok: true, content } : { ok: false, status: r.status };
    }
    if (r.status === 404 || r.status === 410) return { ok: false, status: r.status, final404: true };
    return { ok: false, status: r.status };
  } catch { return null; }
}

let lightpandaBin; // resolved once: the binary the user installed, or none
const runLightpanda = (url) => new Promise((res) =>
  execFile(lightpandaBin, ["fetch", "--dump", "markdown", "--log-level", "error", url],
    { timeout: 25000, maxBuffer: 4e6 }, (err, stdout) => res(err || !stdout ? null : String(stdout))));
async function lightpandaFetch(url) {
  if (!lightpandaBin) return null;
  const content = String(await runLightpanda(url) || "").replace(/^\$time=.*$/gm, "").trim();
  if (WALL.test(content)) return null; // the same rule: a challenge renders to text; it is no answer
  return content ? { ok: true, content } : null;
}

// resolved once at startup: the renderer binary the user installed, or none
try {
  execFileSync("lightpanda", ["version"], { timeout: 5000, stdio: "ignore" });
  lightpandaBin = "lightpanda";
} catch { lightpandaBin = null; }

// ---- SSRF guard: the reader chain fetches only vetted public web pages ----

// True for loopback, link-local (169.254/16, fe80::/10), private (10/8,
// 172.16/12, 192.168/16, fc00::/7), CGNAT (100.64/10), unspecified, multicast
// and reserved addresses — anything the private side of the network could own.
export function isPrivateIp(ip) {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) { const a = +v4[1], b = +v4[2];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || a >= 224;
  }
  const mapped = ip.toLowerCase().match(/^::ffff:(?:0:)?((?:\d{1,3}\.){3}\d{1,3})$/);
  if (mapped) return isPrivateIp(mapped[1]);
  const h = /^[0-9a-f:]+$/i.test(ip) ? parseInt((ip.split(":")[0] || "0"), 16) : NaN;
  return isNaN(h) || (h & 0xff00) === 0   // ::/8: every first hextet 0x00xx — unspecified, ::1, even NAT64-embedded v4
    || (h & 0xfe00) === 0xfc00            // fc00::/7: unique-local
    || (h & 0xffc0) === 0xfe80            // fe80::/10: link-local
    || (h & 0xff00) === 0xff00;           // ff00::/8: multicast
}

// Returns the URL when it is an http(s) address that resolves to public
// network space only, else null. Unresolvable hosts count as private.
// ponytail: the tier's own resolve (and the redirect hops fetch, Ollama and
// lightpanda follow internally) can still rebind between vetting and fetch;
// IPv4-in-IPv6 embeds like 6to4 (2002::/16) also go unclassified. All accepted
// for a single-user local tool. Full fix: pin resolved IPs per hop.
export async function publicUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  let addrs;
  try { addrs = await lookup(u.hostname, { all: true }); } catch { return null; }
  return addrs.every((a) => !isPrivateIp(a.address)) ? url : null;
}

// Returns { ok: true, content } when a reader got the page, { gone: true } when
// the chain really reached the origin and it answered 404/410, or null. Reader
// failures are not a verdict: they pass the torch to the next reader.
async function providerFetch(url, key) {
  if (!(await publicUrl(url))) return null; // a page we cannot vet stays unknown
  let saw404 = false;
  for (const t of [() => plainGet(url), () => ollamaFetch(url, key), () => lightpandaFetch(url)]) {
    const r = await t();
    if (!r) continue;
    if (r.ok) return r;
    if (r.status === 404) saw404 = true;
  }
  return saw404 ? { gone: true } : null;
}

// "live" = the page is there now. "gone" = the page says the job is closed, or
// the last reader confirms it is not there. "unknown" = nothing could read it,
// which is not the same thing as gone.
export async function checkPostings(urls, key) {
  return Promise.all(urls.map(async (url) => {
    let state = "unknown";
    try {
      const r = await providerFetch(url, key);
      if (r?.ok) state = GONE.test(r.content) ? "gone" : "live";
      else if (r?.gone) {
        // the origin really answered 404: one more chance through the apply link
        const alt = jobmeshApply(url);
        const r2 = alt ? await providerFetch(alt, key) : null;
        state = r2?.ok && !GONE.test(r2.content) ? "live" : "gone";
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
  // the fallback tiers shape every provider's rows into the same contract
  const bd = mapBoardRows([{ title: "QA Engineer In Sydney | TheBigJobsite.com", url: "https://au.thebigjobsite.com/j/9", content: "Full-time\n\nSydney / Global\n\n# QA Engineer\n\n## Job description\n\nbody text" }]);
  assert.equal(bd[0].title, "QA Engineer");
  assert.equal(bd[0].location, "Sydney");
  assert.equal(bd[0].key, "qa engineer|sydney|body text"); // the snippet itself is the de-dup fingerprint when nothing else is readable
  const br = mapBoardRows([{ title: "QA Engineer - Acme", url: "https://jobs.lever.co/acme/9", content: "Acme is hiring a QA Engineer in Sydney" }]);
  assert.equal(br[0].url, "https://jobs.lever.co/acme/9");
  assert.ok(br[0].key.startsWith("qa engineer acme|"), JSON.stringify(br[0].key));
  // the SSRF guard: private network space never reaches a reader tier
  assert.equal(await publicUrl("file:///etc/passwd"), null); // the scheme half needs no DNS
  assert.equal(await publicUrl("ftp://host/page"), null);
  // the challenge rule: a wall page is text-rich enough to pass the 40-char gate,
  // so both reading tiers test for it before accepting content
  const challenge = "Verifying you are human. Enable JavaScript and cookies to continue. Just a moment…";
  assert.ok(challenge.length > 40 && WALL.test(challenge));
  // the known boundary: a legit posting whose copy names verify-you-are-human also matches,
  // so both text tiers refuse it and the chain degrades honestly to lightpanda or unknown
  assert.ok(WALL.test("You will build automated tests that verify you are human."));
  assert.ok(["127.0.0.1", "169.254.169.254", "0.0.0.0", "10.1.2.3", "172.20.1.1", "192.168.1.1",
    "100.100.1.1", "::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1"].every((ip) => isPrivateIp(ip)));
  assert.ok(["1.2.3.4", "8.8.8.8", "2606:4700::1111"].every((ip) => !isPrivateIp(ip)));
  // the gone-check phrases: an offline banner closes the posting, plain copy does not
  assert.ok(GONE.test("Unfortunately, this job has recently been taken offline."));
  assert.ok(GONE.test("We regret to inform you that this role is no longer available."));
  assert.ok(!GONE.test("Senior QA Engineer working with modern CI/CD pipelines in Sydney."));
  // the free GET reads HTML: the tags go, the words stay
  assert.equal(stripHtml("<div>Led QA<br>team</div><script>tracking()</script><style>.x{}</style>"), "Led QA team");
  console.log("lib self-check OK");
}