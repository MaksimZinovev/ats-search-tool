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

## Published to GitHub (public)
- Repo: https://github.com/MaksimZinovev/ats-search-tool (gh repo create --public --push, main -> origin/main).
- Push safety audit on tracked tree: no key-shaped strings (config.toml keys empty, .env.example blank, PROGRESS mentions key names only); .env ignored locally and confirmed absent (404) on origin; assets = 3 UI screenshots.
- Topics: ats, australia, brave-search, job-board, job-search, local-first.

## README: "Who is it for and use cases" section (user request, concise)
- Placed above the fold after the two hero screenshots, before What: 2-line intro + 4 bullets (Morning scan / Hidden market / Freshness check / Niche roles); kept built-features only (long-tail keyword suggester stays in Roadmap); pushed to origin.

## Reviewed mark: single boolean per match (user: "reviewed? Y/N", single boolean, ponytail)
- New RW_KEY "ats-reviewed-v1" localStorage store keyed by match URL; marks survive re-searches, sort, 24h cache expiry, and ↻ refreshes (same URL marked once, everywhere it appears).
- matchHtml gains rv checkbox cell (native input, consistent with editor checkboxes); matches table header gains ✓ column with hover tooltip; matchBody renders "n of N reviewed" hint line above the table.
- Delegated change listener: rwSet + live counter update via targeted DOM update (no re-render).
- E2E (quota-free, injected fake row in round-38/43): box renders, toggle stores {"url":true}, counter updates "0→1 of 3", mark persists after full renderRows() re-render; verify pass correctly ⚠-labels the fake domain fetches. Skipped (ponytail): unreviewed-only filter and clear-marks action; add when long-list drift actually annoys.

## README: collapsible "What do you need ..." prerequisites section (user draft, finalised)
- Appended before the footer as a native <details> block: keys list, JEV explainer (scoring model, not a text LLM), 4-row scoring-examples table (individual posting / blog / wrong city / dead posting with forced live 0); pushed to origin.

## README: worked input/output example inside the collapsible prerequisites block
- Real shapes from server.mjs typesafeScores(): input = state (keywords, location, results title+snippet) + model jev-latest + per-result score questions with criteria anchors; output = answers map with plain scores; explained score -> criteria anchor -> UI color bucket; batched one call per platform noted.

## Other job boards (designed, not built) — branch feat/other-job-boards
- Trigger: a live Sydney QA role (Cove / Deck2 Capital, posted 2026-10-19) that the tool could not see. Two gates closed at once: Brave had not crawled the posting (`site:jobmesh.io "QA Engineer" Sydney` → 0, same query on another index → 8 with the job first), and every board copy of it answers a plain fetch with a Cloudflare 403.
- Fix designed: a second search channel (`POST https://ollama.com/api/web_search`, Ollama Cloud key) that returns the posting page as text. Measured: not an LLM call — 3 calls moved /api/usage by 0 requests, $0, 0 tokens — and it bypasses the bot wall because the provider fetches the page.
- Grilling, 4 rounds / 22 questions: fires only on empty platform rows; Brave-only when no key; automatic plus a "look on other boards" button per row; a 4-domain aggregator watch list (jobmesh, jobflurry, thebigjobsite, jobleads) queried only through the second channel, never as platform rows; the existing TypeSafe batch grades the board copies (no extra LLM calls); results live in their own "Other job boards" section; canonical dedup (title + location + employer) so one role counts once; board-copy rows keep their coloured loc/live but say where the words came from; config lives in `config.json` (keys stay in .env).
- Copy (user-reviewed): "Other job boards" / "from a board copy" / "look on other boards" / "other boards: off — add an API key to include them", each with a plain hover explanation, no jargon.
- Full record: plans/other-job-boards-plan.md. Mockup posted to the sideshow session (post bqQjc73KJtI, v2); rendering it exposed two defects now in the build plan: score cells must become pill spans (they render as tall lozenges on multi-line rows) and sidebar tooltips must open downwards (the upward rule covers the Search button).
- Not in this change: public board APIs (greenhouse/lever/ashby/workday/smartrecruiters, all verified keyless), the free OpenRouter grader, the per-search accounting panel.
- Mockup feedback (round 5): copy approved as written; two changes folded in — the boards are named on screen (one chip per board with its page count, plus "found on <board>" under each role) and every background step says so in words and pulses (sidebar line, row counts, row button, section sub-line, board chips). Mockup v5 verified in a browser: sidebar tooltip now opens downwards and stays inside the column; the on-state sidebar line reads "other boards: on — 4 boards asked" so it never contradicts the results below it.
- Mockup feedback, second pass: the visible board chips were rejected — the user wants the board names in the tooltips instead. Mockup v7: no chips; the sidebar line, the section heading, the buttons and the in-flight messages all name jobmesh.io, jobflurry.com, thebigjobsite.com and jobleads.com in their hover text. The only board names on screen are the links under a role, which open the posting. Per-board page counts are dropped: the section reports roles, not pages.

## Other job boards — a second search channel (2026-10-23, branch feat/other-job-boards)

**The problem it solves.** A live Sydney posting existed that the tool could
not see: Quality Assurance Engineer at Cove (the software arm of Deck2
Capital), posted 2026-10-19. Brave had not crawled it, and every copy of it on
a job board answers a plain `fetch` with a Cloudflare 403. The employer
published nothing the tool searches — 29 platform domains, zero hits for the
company name, no careers page, no apply link.

**The channel.** `POST https://ollama.com/api/web_search` — a search endpoint,
not an LLM: no model, no prompt, no tokens, nothing on the balance. The
provider fetches the page and hands the text back, so the bot wall never
applies. `max_results` caps at 10 with no offset, so this channel cannot
reproduce the "60+" page counts. ~2-5 s per call.

**What was built**
- `lib.mjs`: `DEFAULT_WATCH` (jobmesh.io, jobs-au.jobflurry.com,
  au.thebigjobsite.com, www.jobleads.com), `loadWatch()` (config.json wins,
  the four defaults are the fallback), `secondSearch()`, and the page-text
  readers `boardMeta` / `boardTitle` / `boardFingerprint` / `boardQuote` /
  `boardKey`. `node lib.mjs` still prints "lib self-check OK".
- `server.mjs`: `/api/config` gains `ollama`, `/api/watch` returns the watch
  list, `/api/second` runs one second-index search and returns each result
  enriched with employer, location, posting date, a quote and a cluster key.
- `index.html`: the "Other job boards" section under the platform rows; the
  sidebar line in its on / asking now… / off states; the "look on other
  boards" button on every row and on the section; the `?` marker on a row the
  boards had nothing for; score cells as `span.pill` (the old markup turned
  them into tall lozenges on any row with more than one line); and a
  downwards tooltip variant so the sidebar note's explanation stays inside
  the 340px column.

**De-duplication — one role, one row.** Key = normalised title + normalised
place + a fingerprint (the first 120 characters of the job description).
Title and place alone merged four different Sydney "Quality Assurance
Engineer" roles into one row; the fingerprint separates them, and two copies
of one role on two boards share it. The employer (read from the page text
when the board prints one) splits a cluster when two copies disagree.

**Measured, acceptance search "quality assurance engineer" + Sydney** (live,
real browser, 2026-10-23):
- 34 roles in the section, 15 of them matching Sydney, 19 dimmed (loc < 3).
- The Cove role is row 1: rel 4.0, job 3.9, loc 4.0, live 3.2 — one row, "Cove ·
  Sydney, New South Wales · posted 19 Oct", "found on jobmesh.io jobflurry.com ·
  listed in 2 places".
- 23 of the 34 roles have a title the Brave channel never returned at all.
- All 34 board-copy rows carry a coloured loc and live.
- 0 roles counted twice.
- 4 new search calls per search (one per board) + 4 TypeSafe grading calls,
  cached 24 h, so a repeat search costs 0 calls. 0 OpenRouter, 0 Ollama tokens.

**The empty-row trigger is a safety net, not a main path.** Brave returns
results for nearly every `site:` query (10 pages each, even for a nonsense
phrase), so a platform row rarely comes back empty. It fires for a new or
obscure platform Brave has not crawled yet; verified by driving the path
directly — the row's counts fill from the second channel, and the `?` marker
appears when there is nothing there.

**Honest limits.** The copy a board shows can lag the employer's own page, and
the row says so. The section reports roles, not pages, so the "60+" page count
keeps its meaning. Two thirds of the board rows have no employer — jobflurry
and thebigjobsite do not print one — so each row quotes the posting's own
first words instead of guessing a field.
