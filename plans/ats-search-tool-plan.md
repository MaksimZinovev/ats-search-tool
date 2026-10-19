# ATS Search Tool — Build Plan

**Status:** design approved via grilling (3 rounds), 2026-10-19 · awaiting build approval
**Target:** `~/repos/ats-search-tool` (new standalone repo)
**Living progress doc:** `agents/PROGRESS.md` inside the repo (once created)

## What

A local job-search command center: one light-theme page where you enter role
keywords + optional location, and instantly see **result counts across 18 ATS
job-board platforms** — with AI-filtered "real job" counts, full platform CRUD,
and search history. Inspired by tinydesignshop.com/tools/ats-search-generator,
which only generates Google links with no counts, no history, no custom platforms.

## Locked decisions (grilling output)

| Decision | Choice |
|---|---|
| Count semantics | Central page: count per platform. Brave = basis; free Bing scrape fills real "About N" total when Brave caps at 20+ |
| Count source | Brave Web Search API — key in `.env` (free 2,000 q/mo, ~1 qps) |
| Architecture | Self-contained `index.html` + tiny Node ≥18 zero-dep local server (`node server.mjs` → http://localhost:8787) |
| typesafe-ai (MVP) | ① True-job-posting Score per result (0–4, ≥3 = job) ② per-result relevance-to-your-query Score (0–4). One batched request per platform. **NO query gate** (rejected), no keyword chips, no verdict chip |
| Display | Row: `Ashby — 12 pages · 9 jobs`; sort toggle pages↔jobs (default jobs); expandable top-matches with dimmed noise |
| Links | Brave primary + small Google secondary icon; "Open all in tabs" (popup blocker may cap) |
| Platforms | 18 defaults; full CRUD (add/edit/hide/remove + restore defaults), persisted localStorage |
| Count fetch | Auto on search, 1 qps throttle, per-row progress; 24h cache per (query, platform) in localStorage |
| History | localStorage, last 50, click to re-run, clear-all |
| Repo | git init · README · .env(.example) · .gitignore · agents/PROGRESS.md · caveman-blocks with one `.blocks/brave-count` |
| Roadmap (NOT MVP) | Suggested keywords + long-tail keywords via cheap OpenRouter LLM |

## 18 default platforms

Ashby `jobs.ashbyhq.com` · Greenhouse `boards.greenhouse.io` · Lever
`jobs.lever.co` · iCIMS `careers.icims.com` · Jobvite `jobs.jobvite.com` ·
Workday `wd1.myworkdayjobs.com` + `wd3.myworkdayjobs.com` · BambooHR
`jobs.bamboohr.com` · SmartRecruiters `jobs.smartrecruiters.com` · JazzHR
`apply.jazz.co` · Workable `careers.workable.com` · Gem `jobs.gem.com` ·
**Welcome to the Jungle** `welcometothejungle.com` · Teamtailor
`jobs.teamtailor.com` · Recruitee `jobs.recruitee.com` · Breezy
`jobs.breezy.hr` · Pinpoint `jobs.pinpointhq.com` · Homerun `apply.homerun.co`

## Verified facts (do not re-research)

- **Brave API has NO total-count field.** Response: `web.results[]` (max
  20/page), `query.more_results_available` (bool), offset 0–9. Auth:
  `X-Subscription-Token` header. Endpoint: `GET api.search.brave.com/res/v1/web/search`.
- **Bing HTML works from plain HTTP**: `<span class="sb_count">N results</span>`
  — real total estimate, no key, no JS. DDG is anomaly-blocked; Google needs JS.
- TypeSafe System One: Noul = calibrated yes/no probability; Score = 0–4
  ordered rubric; batched independent questions in one request (parallel
  fan-out ~12× cheaper). Needs `TYPESAFE_API_KEY`; all AI features degrade
  gracefully to disabled when absent.
- Reference tool's query shape: `site:jobs.ashbyhq.com "product designer" remote`
  (keywords quoted as phrase, location appended raw; OR mode splits commas).

## Build rules (ponytail — active)

1. **Zero npm dependencies.** Node stdlib only: `http`, `fetch`, 10-line .env
   parser. No express, no dotenv, no framework, no build step, no TS.
2. **Fewest files.** 3 code files: `server.mjs`, `lib.mjs` (pure logic shared
   with the block), `index.html` (all inline CSS/JS).
3. **Native before custom:** `<details>` for expandable rows (no JS accordion),
   native inputs, localStorage, CSS-only light theme.
4. Sequential `for`-loop + `await sleep()` IS the 1-qps throttle. No queue lib.
5. Deliberate shortcuts marked `// ponytail:` with the upgrade path.
6. One runnable check (no test framework): `node lib.mjs` runs assert-based
   self-check on query building + Bing-total parsing; caveman-blocks `verify`
   runs the block's example.
7. AI fan-out via `Promise.allSettled` — failures degrade, never block counts.

## File inventory

```
ats-search-tool/
├── server.mjs        ~130 lines: http server, /api/count /api/total /api/ai /api/config, .env loader, throttle
├── lib.mjs            ~70 lines: buildQueries, parseBingTotal, braveFetch + assert self-check
├── index.html         ~600 lines: single state object → render; controls, results, CRUD, history, cache
├── .env.example       BRAVE_API_KEY= / TYPESAFE_API_KEY=
├── .gitignore         .env
├── README.md          setup, run, quota notes, troubleshooting
├── agents/PROGRESS.md decision log (this plan distilled) + build progress
└── .blocks/
    ├── INDEX.md
    └── brave-count    CLI: brave count + bing total for a query → one JSON line (imports lib.mjs)
```

## Phases

**P1 — Scaffold.** Create repo, git init, README stub, .env.example, .gitignore,
agents/PROGRESS.md with decision log. ✅ empty dir + first commit.

**P2 — lib.mjs.** `buildQueries(keywords, location, orMode, platforms)` →
`{platform, domain, query, braveUrl, googleUrl}`; `parseBingTotal(html)` →
`n|null` (regex on sb_count); `braveCount(query, key)` → `{count, more, results}`.
✅ `node lib.mjs` self-check passes (pure functions, no network).

**P3 — server.mjs.** Static serve index.html; `GET /api/count?q=` (proxy+key);
`GET /api/total?q=` (Bing scrape); `POST /api/ai` (TypeSafe fan-out, one batched
request per platform with 2 Score questions per result);
`GET /api/config` → `{hasBrave, hasTypesafe}`. ✅ curl each endpoint against a
real query; missing-key paths return explicit `{disabled:true}`.

**P4 — index.html.** Light theme, controls (keywords, location, OR toggle),
18 rows with links + progress dots, counts fill as fetched, `pages · jobs`
display, sort toggle, `<details>` top-matches (dimmed noise), open-all,
platform CRUD panel (add/edit/hide/remove/restore), history (50, re-run,
clear), 24h count cache. ✅ full happy path in browser.

**P5 — caveman-blocks + polish.** `caveman-blocks init`, `.blocks/brave-count`
block with typed header + example, `verify` green. README final. PROGRESS.md
updated. ✅ `caveman-blocks run brave-count --q 'site:jobs.lever.co "qa" remote'`
prints one JSON object.

**P6 — End-to-end + commit cadence.** Real search: "software tester" + Sydney
across 18 platforms; verify counts, Bing totals on 20+ platforms, jobs
filtering, cache hit on re-run, history re-run, no-key degradation (rename .env).
Commit per phase; final tag `v0.1.0`.

## Risks & fallbacks

- **Bing layout changes / regional variance** → `parseBingTotal` returns null →
  UI shows "20+" instead of an estimate. `// ponytail:` noted; upgrade path =
  swap in Brave paging or Google CSE later.
- **Brave quota (2,000/mo ÷ 18/search ≈ 110 searches)** → 24h cache +
  per-platform "refresh" click; cache makes repeat searches free.
- **No TypeSafe key** → config flag flips AI features off; raw `pages` counts
  still work. Same for missing Brave key (links generate, counts disabled).
- **Popups blocked on "Open all"** → documented; per-row links always work.

## Out of scope (MVP)

Query gate · keyword suggestion chips · verdict chip · full-listing scrape
beyond Brave's ≤20/page · alerts/scheduling · auth/multi-user · dark theme.