// lib.mjs — shared logic: platforms, query building, Brave search (paged).
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
  console.log("lib self-check OK");
}