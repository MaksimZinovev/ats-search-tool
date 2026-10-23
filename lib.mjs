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

export async function secondSearch(query, key, max = 10) {
  const r = await fetch("https://ollama.com/api/web_search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: Math.min(Math.max(max, 1), 10) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`second ${r.status}`);
  const j = await r.json();
  const results = (j.results || []).map((x) => ({ title: x.title || "", url: x.url || "", content: x.content || "" }));
  return { count: results.length, results };
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
  console.log("lib self-check OK");
}