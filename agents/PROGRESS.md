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
## Verified-loc/live pass (v0.2 direction)
- Tested empirically BEFORE building (user: "test it before building"): Brave snippets carry no/explicit-sparse location+expiry text (WTTJ snippet = skills line; all 7 Greenhouse snippets = role text). Snippet-only loc would be honest-but-gray everywhere.
- Page-fetch verification validated on the real example: WTTJ aL6CdMig page contains "Remote from Spain" + "Job no longer available" banner → both signals live on page. Greenhouse pages carry location text.
- Built: 4-question snippet scoring (rel redefined keywords-only; loc/live questions) + /api/verify (server GETs pages, tag-strip, one batched systemone loc/live re-score, cap 10, 1qps) + expand-triggered verifyRow (native details toggle, capture listener).
- Fail-obvious rule (user req): blocked fetches NEVER collapse to "unclear" — server returns per-url err (HTTP code / timeout / bot-check empty page), UI shows ✕ dashed-red cells + red ⚠ hint naming the failures. Real-net proof: Greenhouse blocked 2/7 (bot check + 404), warning rendered.
- WTTJ example now: rel 2.6 amber, job 3.6 green, loc 1.0 red (different country), live 0.0 red (expired) — pre-click signal working.
- Colors approved: cell tints #e6f4ea/#fef7e0/#fce8e6 buckets; muted gray = snippet-only/unclear; 0 loc & 2.x live render muted not red (no-signal ≠ fail).

## Posting-gone detection (user-catched follow-up: "why was live scored 3?")
- Root cause (investigated empirically): greenhouse redirects REMOVED postings (200, not 404) to job-boards.../<co>?error=true; the "no longer open" banner is CLIENT-RENDERED JS (0 hits in server HTML) → scorer saw a healthy board listing → live 3.0. Same trap had silently produced green live cells for KnowBe4/Testlio/Oodle in round 18.
- Ground truth = greenhouse public JSON API (boards-api.../v1/boards/<co>/jobs; job LIST endpoint works, unblocked): all 6 Brave "Sydney" greenhouse postings GENUINELY dead (ids absent from live lists; churn is high — Brave serves stale ATS postings for weeks).
- Built two layers: (1) deterministic id-loss redirect check server-side (posting path segment lost after fetch redirect → gone, live 0, no wasted AI) + (2) third `still` question in verify batch fed original+final URLs ("is the page still the posting, or a board/list/filled page?") → gone also from text signals, loc preserved. Blocked/unverifiable stays ✕, redirect-gone shows loc "–" + live 0.0 red + red hint line.
- Positive control: live KnowBe4 posting (7476786002) → gone=false, loc 1 (FL vs Sydney, red), live 2.87 amber "probably open" ✓. Dead Oodle/WTTJ → gone/live 0 red ✓. E2E screenshots verified.

## AU region expansion (v0.2) — user goal: expose obscure jobs big boards don't show
- Big platforms (Seek/LinkedIn/Indeed/Jora/CareerOne/Adzuna/Gumtree) excluded by user decision; aggregator noise = the wrong location/expired chaos the tool is meant to kill.
- Probed 24 candidate domains empirically (2 Brave probes each); verified URL shapes (per-posting vs category), verify-endpoint fetchability for each survivor.
- Added 11 built-ins, all visible, region chips: QLD/NSW/WA/TAS/NT Gov Jobs, UniMelb (PageUp), UNSW (external-careers subdomain — the indexed one), ANU, LiveHire, Employment Hero, EthicalJobs.
- Verify-ability map (PROG): gov boards (QLD smartjobs viewFullSingle, WA search.jobs.wa, NT JobDetails — server-rendered, loc/live scored ✓); iworkfor.nsw = Cloudflare 403, UniMelb = refuses non-browser TLS (curl 000 + node network error), LiveHire = WAF 403, UNSW = timeouts — those rows show ✕ + reason, never fake scores; counts still work.
- PLAT_KEY bumped v1→v2 (auto-migration to 29 built-ins; v1 prefs dropped). Custom platforms get region "".
- E2E: 29 rows, 11 chips, gov/uni rows honestly 0 for "software tester" (dimmed); LiveHire expanded → 2 real postings (snippet-scored) + 403-✕ verify states. Screenshot verified.

## Ollama design system applied (impeccable skill)
- User directive: apply /Users/maksim/repos/open-design/design-systems/ollama/DESIGN.md. Impeccable init gate cleared: PRODUCT.md (register: product) + root DESIGN.md written.
- Chrome fully monochrome: white/snow surfaces, 1px #e5e5e5 borders, zero shadows/gradients, SF Pro Rounded h1 (500/24px), binary radius (12px containers / 9999px pills: buttons, inputs, sort tabs, region chips, score cells, history items), weights ≤500, blue focus-visible ring only, flat white bordered tooltips.
- ONE documented chromatic exception: score-cell tints (green/amber/red) + ✕-blocked + warn/err text — they encode the graded signal the tool exists to show (user-approved feature; strict-grayscale variant offered but not requested).
- Browser-verified (screenshots + computed styles): zero shadows on panels/summary/CTA, ink posting links, counts #525252-on-snow (≈7.5:1), hint stone (≈4.7:1), score pill radius 9999px, tooltip content/bg/border/visible at hover. Reduced-motion guard added (pulse + tooltip fade).
- Impeccable skill updated 3.5.0 → 4.6.0 (user-level; applies next session).

## Header copy + title (user: friendlier for first-timers, bolder title)
- h1: 500/24px → 700/30px SF Pro Rounded (user-directed weight bump; sole documented deviation from the Ollama ≤500 restraint).
- New 3-line header: lead (what it is + why: openings live on an ATS before Seek/LinkedIn see them; 29 platforms at once), how (counts fill per platform; expand for ranked matches graded 0-4 on relevance/open-posting odds/location/freshness), trust (runs locally, keys stay).
- Unslop sweep of all user-visible strings: em dashes removed everywhere (header, footer, quota hint, empty state, placeholder, OR-mode label, tooltips now "label: definition", history separator, hint lines, server error strings "HTTP 403, the site blocked the fetch"); ~68ch line caps on header paragraphs; title-case panels unchanged (short labels).
- Verified: h1 700/30px computed; paragraph widths ≤642px; script syntax OK; screenshot checked.

## Impeccable critique → header improvements (user: "like wording, not the look", scoped to header)
- Critique run (A: design review + browser geometry; B: detect.mjs + computed styles), snapshot written to .impeccable/critique/2026-10-19T10-03-54Z__index-html.md. Score 28/40.
- Key finding: header = 259px prose wall before any control (Search btn at y=469); detector: flat-type-hierarchy (10-15px sizes, adjacent ratio ~1.08).
- Header fixes applied (scoped): masthead (h1 32px/700 + single 2-3 line lead, dynamic #platCount so count never lies with custom platforms); how-it-works moved into Search panel as context hint; trust line merged into footer; text-wrap pretty on lead.
- Type scale consolidated page-wide: {11, 14, 32} (nearest ratio 1.27 ≥ 1.25) — detector now CLEAN (exit 0); off-scale text-bearing elements: none.
- Measurements: header 149px (was 259), Search btn y=355 (was 469), all text on-scale.
- Backlog (persisted, not in scope): cancellable search (P2), shareable URL state (P2), static score legend (P3).

## /impeccable bolder — masthead (user-scoped: top section only)
- One bold move, product register (per bolder.md: clarity over drama, monochrome-safe): header inverted to full-bleed black band (--ink bg), h1 700 48px white (.03 tighter tracking), lead 14px #e5e5e5, site: chip on --ink2, #platCount white w500, #banner amber lightened to #f6c177 for black-band contrast (13:1+ everywhere).
- Scale jump 48/14 = 3.4x (bolder.md wants 3-5x); detector CLEAN ({11,14,48}); rest of page byte-untouched (panels/results/footer identical).
- Verified: screenshot header-bold.png (black band, 192px, panels crisp below); DESIGN.md h1/header spec updated to match; commit pending.

## Platforms panel blank names — root cause and fix
- Symptom (user screenshot): AU-state platforms rendered as blank pill circles in the editor; LiveHire/EH/EthicalJobs showed truncated text.
- NOT missing data: /api/platforms and localStorage all had correct names. Layout bug: .plat grid col2 (minmax(70px,0.8fr)) + name input flex:1 min-width:0 let the wide "AU · <STATE>" region chips (65px) crush the name input to 22px = padding-only blank circle; "AU" chips (32px) left 41px so those 3 rows showed text. Earlier "stale LS cache" theory was wrong (my browser LS had 0 blank names; measurements proved squeeze).
- Fix: editor chips shortened to state code (region.split("·").pop() → "QLD"/"NSW"; full region still in results + hover title); grid rebalanced auto minmax(90px,1.2fr) minmax(120px,1fr) auto; name input min-width 48px; name/domain inputs get title = full value (hover reveals truncated text).
- Verified: UNSW name 63px (was 22), chip 42px (was 65); screenshot plat-fix-au.png all 11 AU rows legible. Also added init healing earlier in this fix cycle: server list now always overwrites built-in names/regions in LS cache (customs + hidden flags preserved) — kept as protection against future stale caches.

## README restructured (borrowing jobkit README sections)
- Borrowed per user request from github MaksimZinovev/jobkit: What (table-driven meaning of row columns), Why (the task-pain framing), Quick Start (sh block + "> Note:" tip + free-tier math), Structure (dependency-purpose file tree).
- Updated stale facts: 18 -> 29 platforms (AU boards documented with region chips); grading documented as two passes (snippet pass rel/job; verify pass loc/live + deterministic gone-check); troubleshooting gained bot-check line; roadmap gained stop button + shareable URL state (from persisted critique backlog).
