# PROGRESS — ats-search-tool

Local job-search command center: counts across 18 ATS platforms for your
keywords+location, with AI "real job" filtering. Design doc: `plans/ats-search-tool-plan.md`.

## Decision log (grilling 2026-10-19, approved)

- **Counts**: Brave API, paged up to 3×20 → exact count ≤ 60, else `60+`.
  (Deviation from plan — see below.) 24h cache per (query, platform).
- **AI (typesafe System One)**: per platform ONE batched request, 2 Score
  questions per Brave result — `job` (is this an individual posting? ≥3/4
  counts as a job) + `rel` (relevance to your role+location). NO query gate
  (rejected in grilling), no keyword chips, no verdict chip. Degrades to raw
  counts without key.
- **Display**: `Ashby — 12 pages · 9 jobs`, sort pages↔jobs (default jobs),
  expandable ranked matches, dimmed noise.
- **Links**: Brave primary + Google secondary icon. Open-all best effort.
- **Platforms**: 18 defaults, full CRUD (add/edit/hide/remove/restore),
  persisted localStorage. History: last 50, click to re-run.
- **Runtime**: Node ≥18 zero deps, `node server.mjs` → http://localhost:8787.
- **Ponytail rules**: zero npm deps, 3 code files, native platform features,
  `// ponytail:` markers, one assert self-check, no test frameworks.

## Deviation from plan (found during P3, 2026-10-19)

**Bing-HTML totals removed → Brave paging instead.** The plan's hybrid assumed
Bing gives real `site:` totals server-side. Verified false: Bing ignored
`site:`, returned unrelated pages (wikipedia, degree-symbol sites) and gave
65 → 6,570 for the identical query across runs. The plan's sanctioned fallback
was "20+"; upgraded to Brave paging (exact ≤60, `60+` beyond) — same API, same
key, no new dependency. README "Why no Bing/Google totals" documents this.

## Phases

- [x] P1 Scaffold — repo, gitignore, .env.example, decision log, plan
- [x] P2 `lib.mjs` — buildQuery + paged braveSearch + assert self-check (`node lib.mjs` OK)
- [x] P3 `server.mjs` — static + /api/count /api/ai /api/config /api/platforms
- [x] P4 `index.html` — light theme UI, verified via ego-browser (see evidence)
- [x] P5 caveman-blocks — init, json-peek, `brave-count` (lint OK, network effect granted)
- [x] P6 E2E (keyless scope) + tag v0.1.0

## Test evidence (2026-10-19)

- `node lib.mjs` → **lib self-check OK** (query building, OR mode, quoting).
- **Live TypeSafe fan-out** (TYPESAFE_API_KEY present in env): real posting
  "Senior Software Tester – Payments" → `job 3.93, rel 3.98`; blog post →
  `job 0, rel 0.99`. Exactly the designed behavior.
- **Degraded mode (no Brave key)** via ego-browser: 18 rows render instantly
  with correct queries (`site:jobs.ashbyhq.com "software tester" Sydney`),
  Brave+Google links + ↻, per-row "no Brave key", banner hint. Screenshot:
  light theme confirmed clean.
- **CRUD**: added `jobs.acme.test` → 19/19 persisted in localStorage; restore
  defaults → 18/18.
- **History**: "software tester — Sydney" captured, re-run works.
- `caveman-blocks run brave-count` **verified** — stamp `9a79962d25d3` (network effect granted in config).

## Full E2E (keys live, 2026-10-19)

Key found in `~/repos/ats-search/.env` under a typo (`BRAVE_APY_KEY`); corrected to
`BRAVE_API_KEY` and wired into this repo's `.env` (chmod 600) together with
`TYPESAFE_API_KEY` from `~/.config/env/.env.keys`. Live query `"software tester" + Sydney`:

```
Greenhouse  7 pages · 7 jobs   SmartRecruiters 2 pages · 2 jobs
Lever       2 pages · 1 job    Workday wd1     1 page · 1 job
WTTJ        1 page · 1 job     Workday wd3     1 page · 0 jobs (noise filtered)
12 platforms: 0 pages (honest zeros, dimmed)
```

Matches ranked by relevance desc (2.7 → 1.1), noise dimmed, cached re-run instant.

## Roadmap (not built)

- Suggested keywords + long-tail keywords via cheap OpenRouter LLM.