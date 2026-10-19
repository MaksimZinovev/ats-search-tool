# PROGRESS — ats-search-tool

Local job-search command center: counts across 18 ATS platforms for your
keywords+location, with AI "real job" filtering. Design doc: `plans/ats-search-tool-plan.md`.

## Decision log (grilling 2026-10-19, approved)

- **Counts**: Brave API basis (exact ≤20/page; no total field exists), free Bing
  scrape fills `~N est.` totals when Brave caps at 20+. Fallback: `20+`.
- **AI (typesafe System One)**: per platform ONE batched request, 2 Score
  questions per Brave result — `job` (is this an individual posting? ≥3 counts
  as job) + `rel` (relevance to your role+location). NO query gate (rejected),
  no keyword chips, no verdict chip. Degrades to raw counts without key.
- **Display**: `Ashby — 12 pages · 9 jobs`, sort pages↔jobs (default jobs),
  expandable top matches, dimmed noise.
- **Links**: Brave primary + Google secondary icon. Open-all best effort
  (popup blockers may cap).
- **Platforms**: 18 defaults, full CRUD (add/edit/hide/remove/restore),
  persisted localStorage.
- **Fetch**: auto on search, sequential, 24h cache per (query, platform).
- **History**: localStorage, last 50, click to re-run.
- **Runtime**: Node ≥18 zero deps, `node server.mjs` → http://localhost:8787.
- **Ponytail rules**: zero npm deps, 3 code files, native platform features,
  `// ponytail:` markers, one assert self-check, no test frameworks.

## Phases

- [ ] P1 Scaffold — repo, gitignore, .env.example, this file
- [ ] P2 `lib.mjs` — buildQuery/parseBingTotal/braveCount + self-check
- [ ] P3 `server.mjs` — static + /api/count /api/total /api/ai /api/config /api/platforms
- [ ] P4 `index.html` — light theme UI, counts, CRUD, history, cache
- [ ] P5 caveman-blocks `.blocks/brave-count` + README
- [ ] P6 E2E + tag v0.1.0

## Status

Building. See git log for per-phase commits.

## Pending (user)

1. Put real keys in `.env` (`cp .env.example .env`), then re-run and confirm:
   counts + `pages · jobs` appear; `caveman-blocks verify brave-count` passes.
2. First real search suggestion: "software tester" + Sydney.