// lib.mjs — shared logic: platforms, query building, parsers, API fetchers.
// Self-check (no network): node lib.mjs
import assert from "node:assert/strict";

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
].map(([id, name, domain]) => ({ id, name, domain, builtin: true, hidden: false }));

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

// Bing total estimate, e.g. '<span class="sb_count">65 results</span>'.
// ponytail: single regex; if Bing changes markup this returns null → UI shows "20+".
export function parseBingTotal(html) {
  const m = html.match(/class="sb_count"[^>]*>([^<]+)</);
  if (!m) return null;
  const n = m[1].match(/[\d.,]+/);
  if (!n) return null;
  const v = parseInt(n[0].replace(/[.,\s]/g, ""), 10);
  return Number.isFinite(v) ? v : null;
}

export async function braveCount(query, key) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20`;
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
    return { count: results.length, more: !!j.query?.more_results_available, results };
  }
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export async function bingTotal(query) {
  try {
    const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!r.ok) return null;
    return parseBingTotal(await r.text());
  } catch {
    return null; // ponytail: Bing total is best-effort; "20+" is the fallback display
  }
}

// ---- self-check: node lib.mjs (pure functions only, no network) ----
if (process.argv[1]?.endsWith("lib.mjs")) {
  assert.equal(buildQuery("jobs.ashbyhq.com", "product designer", "remote", false),
    'site:jobs.ashbyhq.com "product designer" remote');
  assert.equal(buildQuery("jobs.lever.co", "qa, software tester", "", true),
    'site:jobs.lever.co "qa" OR "software tester"');
  assert.equal(buildQuery("x.com", 'weird "quotes"', "  ", false), 'site:x.com "weird quotes"');
  assert.equal(buildQuery("x.com", "engineer", "Sydney", true), 'site:x.com "engineer" Sydney');
  assert.equal(parseBingTotal('<span class="sb_count">65 results</span>'), 65);
  assert.equal(parseBingTotal('<span class="sb_count">About 1,234 results</span>'), 1234);
  assert.equal(parseBingTotal('<div class="x">no results</div>'), null);
  assert.equal(braveUrl('a b').endsWith(encodeURIComponent('a b')), true);
  console.log("lib self-check OK");
}