# Other job boards — design record and build plan

**Status:** design settled by grilling (4 rounds), 2026-10-23 · **not yet built**
**Branch:** `feat/other-job-boards`
**Mockup:** posted to the sideshow session `D3rq_FoE3yk` (post `bqQjc73KJtI`, version 2)
**Related:** `plans/ats-search-tool-plan.md` (the original build), `agents/PROGRESS.md` (running log)

## The problem

A live job posting existed that the tool could not see. The posting was a
Quality Assurance Engineer role at Cove (the software arm of Deck2 Capital),
Sydney NSW, full-time, first seen online on 2026-10-19.

Two gates were closed at once:

1. **Discovery.** The tool finds postings by asking Brave for `site:<platform>
   "role keywords" <location>`. Brave had not crawled that posting. Measured on
   the same query string:

   ```
   Brave   site:jobmesh.io "Quality Assurance Engineer" Sydney  →  0 results
   second  site:jobmesh.io "Quality Assurance Engineer" Sydney  →  8 results, the Cove job first
   Brave   site:jobmesh.io "Quality Assurance Engineer"         →  4 results, all outside Australia
   ```

   Brave also had no copy of the posting under any query tried, including
   `"Quality Assurance Engineer" "Deck2"`, `site:jobmesh.io "Cove"`, and
   `"operating entity for Deck2 Capital"`. `country=AU` and `freshness` did not
   change the result. The gap is the index, not the query.

2. **Verification.** After finding a posting the tool re-scores location and
   freshness by fetching the posting page itself (`server.mjs:118`, a plain
   `fetch` with a browser user agent). `jobmesh.io`, `jobs-au.jobflurry.com` and
   `au.thebigjobsite.com` all answer that with a Cloudflare challenge:

   ```
   plain fetch, tool's headers            → 403 "Just a moment…"
   plain fetch, full browser header set   → 403 "Just a moment…"
   a real browser                         → 200
   ```

   A job board copy of the same posting was readable when fetched as text, and it
   carried the fields the tool needs: `Location: Sydney, New South Wales`,
   `Online since 10/19/2026`, the employer, and the full description.

The employer published nothing the tool searches. All 29 platform domains were
queried for the employer name: zero hits on every one. The company's own site
(`joincove.ai`) has no careers page and no apply link. The "Apply now" chain on
the job board copy runs `jobmesh.io → jmmst.com → au.thebigjobsite.com →
collegerecruiter-redirect.com → jobleads.com/register/…` and ends at a
registration wall, never at an application form.

## Facts established while designing

Measured, not assumed.

| Fact | How it was established |
|---|---|
| `POST https://ollama.com/api/web_search` is not an LLM call | It names no model, sends no prompt, returns no tokens. Three calls moved Ollama's `/api/usage` by 0 requests, $0, 0 input tokens, 0 output tokens. |
| It returns the posting page as text, not a snippet | 12,413 characters for the Cove job, including location, posting date, employer and description. A provider fetched the page, so Cloudflare never enters. |
| It honours `site:` filters | `site:jobmesh.io "Quality Assurance Engineer" Sydney` returned 8 job board pages, all from `jobmesh.io`. |
| It caps at 10 results and has no offset | The API has `max_results` (max 10) and no paging parameter, so this channel cannot reproduce the "60+" page counts. |
| `POST https://ollama.com/api/web_fetch` reads a single URL | Same shape: URL in, page text out. |
| OpenRouter free models cost nothing and report exact usage | 17 models at $0, up to 1M context. A call to `openrouter/free` returned `usage.prompt_tokens`, `usage.completion_tokens`, `cost: 0`, and the key's allowance is 1000 free requests per day. |
| TypeSafe reports no token counts | `/v1/systemone` answers with `{answers:{…}}` only. `/v1/usage` and `/v1/quota` return 404. TypeSafe input and output can only be estimated. |
| The OpenRouter key originally pasted into `.env` was dead | `sk-or-v1-17d68…` returns 401 from `openrouter.ai/api/v1/key`. The working key is `OPENROUTER_API_KEY` in `~/.config/env/.env.keys` (`sk-or-v1-0ee25…`). Both working keys are now in the repo `.env` and verified from there. |
| Listing pages and sitemaps are dead ends on these boards | `jobmesh.io/robots.txt` disallows every URL with a query string, which is why only per-posting pages are indexed. `jobmesh.io/sitemap.xml` holds 100 static URLs and no job URLs. The listing page is JavaScript-rendered and exposes no posting links in the DOM. |
| Public board APIs work without a key | `api.lever.co/v0/postings/<company>` returned 43 postings with title, location, posting date and country. `boards-api.greenhouse.io/v1/boards/<company>/jobs` and `api.ashbyhq.com/posting-api/job-board/<company>` also answered 200. Kept as a later idea; not part of this change. |

## The grilling record

Four rounds, 22 questions. Every option that was rejected is recorded, because
the reasons are the point.

### Round 1 — the second index and the free model

| # | Question | Answer | Note |
|---|---|---|---|
| Q1 | When does the second index fire? | Only when a platform row came back empty (0 results) | One extra call per empty row, usually 1–3 rows per search |
| Q2 | What does the tool do with no Ollama key? | Brave only; the second index does not run | No keyless scraping fallback: HTML scraping was already rejected in this repo after the Bing-HTML experiment |
| Q3 | Automatic or user-triggered? | Automatic on empty rows, plus a "look on other boards" button on every row | The button covers rows where Brave returned something stale |
| Q4 | What job does the free model do? | *The user asked for a fact, not a decision:* Ollama's `web_search` and `web_fetch` are not LLM calls, so no free model is needed for the second index at all | Answered in round 2 below |
| Q5 | What is the JSON config? | `config.json` in the repo root: model ids and settings only, keys stay in `.env` | Conditional on needing an LLM; deferred, see Q10 |
| Q6 | What does the per-search accounting count? | TypeSafe and OpenRouter counted separately, OpenRouter tokens exact, TypeSafe estimated and labelled "est.", Ollama searches counted as searches | Conditional on needing an LLM; deferred, see Q10 |
| Q7 | Which keys go into the repo `.env`? | Copy the working `OPENROUTER_API_KEY` and `OLLAMA_API_KEY` from `~/.config/env/.env.keys` | Done, both verified from the repo `.env` |

### Round 2 — the shape of the feature

| # | Question | Answer |
|---|---|---|
| Q8 | Which domains does the second index cover? | A separate aggregator watch list: `jobmesh.io`, `jobs-au.jobflurry.com`, `au.thebigjobsite.com`, `www.jobleads.com` — queried through the second index only, never as platform rows |
| Q9 | Who grades the second-index results? | The existing TypeSafe Jev call, in the same batch, with no extra LLM calls. The board copy's page text slots into the existing `results[].description` field |
| Q10 | What gets built now? | The second index first. `config.json` model settings, the free grader and the accounting panel are the next slice |
| Q11 | Where do the results appear? | A separate "Other job boards" section below the platform rows |

Round 2 also answered the round 1 confusion: because the board copy arrives as
title plus page text, the existing grader handles it. The whole feature costs
**no LLM tokens**.

### Round 3 — the last design questions

| # | Question | Answer |
|---|---|---|
| Q12 | Which domains are on the watch list? | The four niche Australian aggregators named in Q8. SEEK, Indeed and Jora stay out: they are the noise the tool was built to kill |
| Q13 | Can the watch list be edited? | Yes, but as data, not code: it moves into the separate JSON config file |
| Q14 | How much trust do the board copies' scores get? | Coloured like verified scores, with a plain label on the row saying where the words came from |
| Q15 | How are duplicates avoided across channels? | Canonical key of normalised title plus normalised location plus employer. One role, listed with each place it was found |
| Q16 | Where does the "switched off" note live? | One quiet line in the sidebar under Search, plus a small "?" marker on rows the second channel could not check, both with hover explanations |
| Q17 | Where do the manual buttons live? | A "look on other boards" button on each platform row, and one on the section heading |

### Round 4 — the words

Rules set by the user: friendly for a first-time non-technical reader, no
forward-referencing, no internal vocabulary.

| # | Slot | Chosen | Rejected |
|---|---|---|---|
| Q18 | Section heading | **Other job boards** | "More platforms" (hides that these boards republish other people's postings), "Wider search" (does not say where results come from) |
| Q19 | Match marker | **from a board copy** | "read from a copy" (sounds technical), "board copy" (reads like a product label) |
| Q20 | Button | **look on other boards** | "check the other boards" (diagnostic rather than an action), "more results" (does not say where they come from) |
| Q21 | Off-state note | **other boards: off — add an API key to include them** | "extra job boards are switched off" (no next step), "coverage: main boards only" (a limitation, not a setting) |
| Q22 | Config file name | **`config.json`** | "sources.json" (has to grow), "job-boards.json" (over-promises, it will also hold model settings) |

### Round 5 — feedback on the mockup

The copy in round 4 was approved as written ("looks good"). Two changes came
back from reviewing the mockup.

| # | Feedback | Decision |
|---|---|---|
| Q23 | "be explicit: include other job board names" | The board names live in the tooltips, not in a visible list. Every place the tool refers to the other job boards, the hover text names them: jobmesh.io, jobflurry.com, thebigjobsite.com and jobleads.com. The only board names on screen are the links under a role, which open the posting itself |
| Q24 | "please ensure there is user-facing clear visual feedback when background process that matter for them is working" | Every place the tool is working in the background says so in words and pulses while it runs. A silent wait is not acceptable |

Q23 in detail. A first attempt put the boards on screen as a row of chips, one per
board with its own page count. That was rejected: it is a visible list of
domains the user never asked for. The names now live in the hover text, so
wherever the tool says "other job boards" the tooltip spells out which boards
it means:

```
other boards: on
  → We ask jobmesh.io, jobflurry.com, thebigjobsite.com and jobleads.com
    for the same search. Jobs posted in the last few days often show up here
    first, before the main search has caught up.
```

The same naming applies to the section heading, the buttons on a platform row
and on the section, and the in-flight messages. The one place a board name is
visible is under a role, where the links open the posting:

```
found on  jobmesh.io  jobflurry.com  · listed in 2 places
```

Per-board page counts are not shown. The section reports roles, not pages, so
the tool's existing page count keeps its meaning.

Q24 in detail. Five surfaces show that work is running, each with a word and a
pulse, never a spinner the user has to interpret:

| Surface | In flight | Settled |
|---|---|---|
| Sidebar line | other boards: asking now… | other boards: on |
| Platform row counts | pulsing … | 0 pages / 0 jobs, dimmed |
| Platform row button | looking… | look on other boards |
| Section sub-line | asking now… | 3 roles found |

The row body says "asking jobmesh.io, jobflurry.com, thebigjobsite.com and
jobleads.com for this one…", and the section says "matching each role to the
jobs you searched for, results appear here as they arrive" so a partial result
set is never mistaken for a finished one.

Two placement rules came out of rendering the mockup in a browser:

- The tooltip in the sidebar opens downwards and stays inside the sidebar
  column. The existing rule opens upwards, which put the explanation over the
  Search button; a downwards variant is needed.
- The tooltip rides on the whole note line, not on the small marker inside it.
  A tooltip anchored to a 15px marker at the end of the line opens outside the
  column.

## The design

```
SEARCH (keywords + location + chosen platforms)
   │
   ├─ Brave  site:DOMAIN "kw" loc  →  29 platform rows   (unchanged)
   │        └─ the row came back empty?
   │             └─ yes → second-index search for that same domain
   │
   └─ second-index search on the watch list (the four job boards)
            └─ → "Other job boards" section below the platform rows
                  └─ graded by the same TypeSafe batch (rel / job / loc / live)
```

**Configuration.** `config.json` in the repo root, gitignored next to `.env`:

```json
{
  "watch": [
    { "domain": "jobmesh.io",          "label": "JobMESH" },
    { "domain": "jobs-au.jobflurry.com", "label": "JobFlurry" },
    { "domain": "au.thebigjobsite.com",  "label": "The Big Jobsite" },
    { "domain": "www.jobleads.com",      "label": "JobLeads" }
  ]
}
```

`models` is added to the same file when the free grader and the accounting panel
are built. Keys never go in this file: `OLLAMA_API_KEY` and `OPENROUTER_API_KEY`
live in `.env`, which is already gitignored.

**Cost.** The second index costs no LLM tokens and nothing on the Ollama
balance. Each watch-list domain is one search call per search, cached for 24
hours under the existing cache key `(query, domain)`, so repeat searches are
free.

**De-duplication.** One role is one row, wherever it was found. The key is the
normalised title plus the normalised location plus the employer. When the
employer cannot be read out of the page text, the key falls back to title plus
location and the cluster is marked as a possible match rather than a certain
one.

**Trust.** A board copy's text is the real posting page, so `loc` and `live` are
coloured as verified rather than left grey. The row says where the words came
from, so the user can still tell that the tool did not fetch that page itself.
A section footnote says the copy can lag the employer's own page.

## Copy

Every user-visible string this change adds.

| Where | String | Hover explanation |
|---|---|---|
| Sidebar line, channel on | other boards: on | We ask jobmesh.io, jobflurry.com, thebigjobsite.com and jobleads.com for the same search. Jobs posted in the last few days often show up here first, before the main search has caught up. |
| Sidebar line, channel off | other boards: off — add an API key to include them | Without this, jobs posted in the last few days can be missing. Add an API key and we ask jobmesh.io, jobflurry.com, thebigjobsite.com and jobleads.com for the same search. |
| Sidebar line, working | other boards: asking now… | Asking jobmesh.io, jobflurry.com, thebigjobsite.com and jobleads.com now. |
| Section heading | Other job boards | The other job boards we ask for every search: jobmesh.io, jobflurry.com, thebigjobsite.com and jobleads.com. |
| Section bar, counts | 34 roles · 15 match Sydney | — (two cells, like a platform row's pages and jobs; the "match" half appears only when a place was searched; "off" and "…" while the boards are off or asking) |
| Section bar, name | Other job boards | The other job boards we ask for every search: jobmesh.io, jobflurry.com, thebigjobsite.com and jobleads.com. |
| Section bar, when a board does not answer | ⚠ 4 of the 4 boards did not answer just now — their roles are the ones from the last time they did. Try again in a minute. | — |
| Match marker | from a board copy | — |
| Sources under a match | found on jobmesh.io jobflurry.com · listed in 2 places | — |
| Under a match, when the board prints no employer | the posting's own first words, e.g. Cove is the operating entity for Deck2 Capital. Together, we acquire and operate good… | — (a quote, not a guess: two thirds of the board copies print no employer, and the title alone does not tell two roles apart) |
| Row button | look on other boards | Asks the other job boards for results this search missed. |
| Section button | look on other boards ↻ | Asks the other job boards for results this search missed. Free, and repeated searches are cached. |
| Row button, working | looking… | — (dashed border, pulsing) |
| Row body, working | asking <the platform's domain> for this one… | — (the platform names the domain being asked, because that is what a platform row is waiting for) |
| Section, working | asking jobmesh.io, jobflurry.com, thebigjobsite.com and jobleads.com now… | — |
| Section, working | matching each role to the jobs you searched for, results appear here as they arrive. | — |
| Skipped-row marker | ? | We could not ask the other job boards for this one, no API key. / We asked the other job boards for this one. Nothing there either, this role may not be published yet. |
| Section footnote | — | The copy a job board shows can lag the employer's own page. Open the posting to confirm the role is still open. |
| Off-state section | — | These boards are off. Add an API key and this search will ask them too, that is where jobs posted in the last few days usually show up first. |

## Build plan

Four files change. No new dependencies, no new package, the tool keeps its
three-file shape (`index.html`, `lib.mjs`, `server.mjs`).

### 1. `lib.mjs`

- `secondSearch(query, key, max = 10)` → `[{title, url, content}]` against
  `https://ollama.com/api/web_search`. Reuses `buildQuery` unchanged, so the
  `site:` filter and the OR mode behave exactly as they do for Brave.
- `WATCH` loaded from `config.json` when present, with the four default domains
  as the fallback when the file is missing.
- Self-check assertions for the new pure helpers, alongside the existing ones.

### 2. `server.mjs`

- Read `OLLAMA_API_KEY` from `.env` next to the existing keys.
- `/api/count` gains an engine parameter. The Brave path is untouched.
- A second-index endpoint that takes the same query shape and returns the same
  row shape, so the browser code stays symmetrical.
- `/api/verify` gains a fallback: when the direct fetch of a posting page is
  blocked, read the page through the board copy the second channel already
  found, and score `loc` and `live` from that text instead of showing a blocked
  cell.

### 3. `index.html`

- The "Other job boards" section, rendered below the platform rows.
- Board names in the tooltips: the sidebar line, the section heading, the row
  button, the section button and the in-flight messages all name the four
  boards in their hover text. No visible list of domains.
- The "look on other boards" button on each platform row and on the section
  heading, plus its in-flight state.
- The sidebar line, in its on, off and working states.
- The "?" marker on rows the second channel could not check.
- The board-copy marker on second-channel matches, and the de-duplicated
  clusters with their source links.
- **Background work is visible.** Five surfaces pulse and say what is happening:
  the sidebar line, the row counts, the row button, the section sub-line and
  the row body. No silent waits.
- **Score cells become pill elements.** The mockup showed the current markup
  turning score cells into tall rounded lozenges on any row with more than one
  line, which the board-copy rows always have. The number moves into a
  `span.pill` so the cell keeps its compact shape.
- **Tooltips in the sidebar open downwards.** The existing tooltip rule opens
  upwards, which put the explanation over the Search button. A downwards variant
  is needed, and the tooltip rides on the whole note line so it stays inside the
  sidebar column.

### 4. `config.json`

The watch list, as shown above.

### 5. `.env` and `.gitignore`

`OLLAMA_API_KEY` and `OPENROUTER_API_KEY` are already in place. `config.json`
joins `.env` in `.gitignore` so a local watch list can never be committed by
accident.

## Interface contract

The browser owns the flow, the server owns the two search channels. The
contract is small on purpose, so the two halves do not drift.

### What the server exposes

| Call | Returns |
|---|---|
| `GET /api/config` | `{brave, typesafe, ollama}` — `ollama` is true when a key is present |
| `GET /api/watch` | `[{domain, name}]` — the watch list from `config.json`, e.g. `{domain:"jobs-au.jobflurry.com", name:"jobflurry.com"}`. `name` is the short form the copy uses |
| `GET /api/second?q=<query>` | `{count, results:[{title, url, content}]}` — one second-index search. `q` is a `site:` query the browser built; `{disabled:true}` when there is no key |
| `POST /api/ai` | unchanged — the browser grades board copies with this same call, `results[].description` = the page text |
| `POST /api/verify` | unchanged — no fallback map. Board copies are graded by the existing `/api/ai` call, because the copy's page text arrives as `results[].description` and that pass already asks `loc` and `live`; the browser colours those cells instead of muting them |

`content` is the page text the provider read. The browser sends the first
1,500 characters of it as `description`: the fields that decide location,
posting date and employer sit in the first few hundred characters, and the
grader's cost scales with the prompt.

### What the browser owns

- Building the per-domain `site:` query (it already mirrors `buildQuery`).
- The 24h cache: today's key, the built query string, which already contains
  the domain.
- De-duplication, and every "in flight" state.

### De-duplication rule

Key = normalised title + normalised location + a fingerprint of the posting.

- title: lowercase, drop the board's own suffix (` In Sydney |
  TheBigJobsite.com`), drop punctuation.
- location: the first segment of the board's location text, split on `,` or
  `/` — `Sydney, New South Wales` and `Sydney / Global` both give `sydney`.
  The boards print `place / work type` (`Sydney / Global`, `Sydney / On-site`),
  and the second part is how the role is worked, not where it is. The row shows
  the place only; the grader still sees the whole line, so it can tell a
  remote role from a local one.
- employer: read from the page text when the board prints it (jobmesh prints
  it under the title; jobflurry and thebigjobsite do not). If two copies in a
  cluster both name an employer and the names differ, they are two roles and
  split into two rows. If one copy names no employer, it merges into the
  matching title and location cluster, and the cluster takes its employer and
  posting date from whichever copy has them. That is why the Cove row can show
  "Cove · Sydney, New South Wales · posted 19 Oct" from the jobmesh copy even
  though the jobflurry copy carries neither. No wording is needed for a
  possible match, so no string is added.
- fingerprint: the first 120 characters of the job description, normalised. It
  is part of the key, because title and place alone are not enough: one Sydney
  search for "Quality Assurance Engineer" brings back four different roles
  with the same title, and only the description tells them apart. Two copies
  of one role on two boards share the fingerprint and land on one row; two
  different roles do not, and neither swallows the other. Measured on the
  acceptance search: the Cove job is one row, "found on jobmesh.io jobflurry.com
  · listed in 2 places".

### Is the posting still open?

The board's copy of a page in the search index is a snapshot. A role that
closed last week still reads like a live one there, so its freshness score is
the freshness of the copy, not of the role. Measured: the Automic posting
("Senior AI QA Engineer", Sydney, 7 Oct) scored live 3.1 while the board's own
page said the job is no longer available.

So the tool checks. For the roles that claim to be open (up to six, the ones
worth checking), the provider fetches the posting page itself and the answer
is one of three:

- **live** — the page is there now, and the copy is not old.
- **gone** — the board says the job is no longer available. The row gets a
  "no longer open" badge and its live score is 0, like a dead posting on a
  platform.
- **unknown** — the fetch failed. That is not the same as closed, so the
  score is shown muted, not red, and the cell says we could not confirm it.

A fetch that fails is not read as "closed": a live JobLeads posting also fails
to fetch, because the provider is blocked there. Only the board's own words
make a posting gone.

A role we already checked keeps its verdict, so a repeat search asks nothing
new.

### How the section reads

The section is a result, so it is not there before there is one. On a fresh page
it is not rendered at all: an empty bar saying "0 roles" before any search is a
count of nothing, and a "look on other boards" button with no keywords asks the
boards for the empty phrase (four calls for nothing). The sidebar line stays
the one place that says the channel is on, and its tooltip names the boards.
The section appears with the first search.

The section is a collapsible bar like a platform row, so it folds away with the
rest of the results: the name, the two counts, and the button sit in the same
grid as every platform row above it. The board names stay in the tooltip, not
in the bar, as decided earlier.

Inside it, the roles are ordered so the best are on top: rows whose four
scores are all green first, then the roles in the place that was searched,
then the highest total. A role that scores green everywhere is a real posting
in the right place that is still open — that is the row worth reading first.

A board that does not answer (the provider rate-limits) does not take the
section down. Its last good roles stay, and the bar says how many boards did
not answer.

### The same posting in two places

A posting can be in a platform row and in the "Other job boards" section at
once — the same URL, the same job. When that happens, the board copy's
location and freshness fill the platform row's cells. A board copy read the
whole posting, so its score beats a search-snippet score and a blocked fetch
(the ✕ that jobmesh gives us). The cell says where the numbers came from, so
the row never implies the platform's own page was fetched.

### What triggers the second channel

Two mechanisms, two different jobs. Both are one `GET /api/second?q=site:DOMAIN …`
call, so the server does not care which one fires.

| Trigger | What is asked | Where the hits land |
|---|---|---|
| Every search | the four watch-list boards | the "Other job boards" section |
| A platform row that came back empty | that platform's own domain | that platform's row, so its counts fill in and its matches are scored |

The watch list runs on every search because a healthy-looking search (every
platform non-empty) must still be able to find a job that only exists on a job
board. If the boards were asked only when some platform row was empty, that
job would be missed exactly when the main search looks fine.

The empty-row trigger asks that platform's own domain because that is the gap
the watch list does not cover: a platform Brave has not crawled yet. If it
asked the same four boards, it would duplicate an ask that already happened
and "fire only on empty rows" would control nothing.

The "look on other boards" button on a platform row and on the section asks the
four boards again, fresh rather than cached, and their hits land in the
section.

## Risks

| Risk | Handling |
|---|---|
| The board copy lags the employer's own page | The row says it is a copy, and the section footnote says to open the posting to confirm |
| Board copies are Cloudflare-walled to plain fetches | The second channel never needs the tool to fetch: the provider returns the text |
| Ten results per domain is not a count | The section reports roles found, not pages, so the tool's existing page count keeps its meaning |
| The watch list becomes a noise source | SEEK, Indeed and Jora are excluded. A domain that starts producing noise gets removed from `config.json` |
| Two channels show the same role | Canonical key, with the employer's own page listed as the one to trust |
| The second channel adds no new tokens but does add calls | Cached for 24 hours under the existing cache key. No LLM cost either way |

## How we will know it worked

Run the same three searches before and after: "qa engineer" with Sydney,
"product designer" with Sydney, "software tester" with remote.

| Measure | Before | Measured after |
|---|---|---|
| Roles found that the Brave channel missed | 0 | 24 of the 34 roles carry a title the Brave channel never returned at all (22 of the 24 distinct titles among them). Brave returned 102 distinct titles across the 29 platform domains; the four boards added 24 more. |
| Board-copy rows with coloured location and freshness | 0 | every board-copy row (the description is the page, not a snippet) |
| Roles counted twice | n/a | 0 — the Cove role is one row, "found on jobmesh.io jobflurry.com · listed in 2 places" |
| LLM tokens spent per search | unchanged | unchanged — 0 OpenRouter calls, 0 Ollama tokens |
| New calls per search | 0 | 4 board searches (2.5–3.0 s for all four), plus one per empty platform row, cached for 24 hours |
| The section is a wall of noise | n/a | 34 roles, 15 of them match the place searched, 19 dimmed but not hidden; the rest of the search is untouched |

The three comparison searches all return on-topic roles: "qa engineer" with
Sydney gives 40 results in 37 clusters, "product designer" with Sydney 40 in
39, "software tester" with remote 40 in 38 — and the remote search returns
remote roles ("Automation Tester", "Remote Senior AI/ML Quality Assurance
Engineer").

The acceptance case is the one that started this: a Quality Assurance Engineer
role in Sydney posted on 2026-10-19, visible on a job board, invisible to the
tool. After this change it must appear in the "Other job boards" section, with
its location and freshness scored, counted once, with every board copy listed
under it. Measured: row 1 of the section, rel 4.0, job 3.9, loc 4.0, live 3.3,
"Cove · Sydney, New South Wales · posted 19 Oct".

The employer behind that role has no ATS posting and no careers page, so the
board copies are the whole story for it. The employer's own posting is listed
alongside them when one exists; for this role there is none, and that is not a
failure of the feature.

### What this cannot promise

- A posting that **neither** index has crawled stays invisible. Two indexes are
  a wide net, not a guarantee.
- The empty-row trigger rarely fires. Brave returns 10 pages for nearly every
  `site:` query, even a nonsense phrase, so a platform row rarely comes back
  empty. It is a safety net for a new or obscure platform Brave has not crawled
  yet, not a main path. Verified by driving it directly: the row's counts fill
  from the second channel and the `?` marker appears when there is nothing
  there.
- A board copy can lag the employer's own page, and the row says so. The
  employer rule is unchanged: an employer posting is listed when one exists.

## Not in this change

- Public board APIs for Greenhouse, Lever, Ashby, Workday and SmartRecruiters.
  Verified to work without a key, and a better answer than any search engine
  for those platforms, but a separate piece of work.
- The `config.json` model settings, the free OpenRouter grader and the
  per-search accounting panel. The accounting line can appear in this change
  (TypeSafe calls with estimated tokens, plus the number of board searches)
  without any OpenRouter involvement.
- Making job boards into platform rows the user can tick on and off.
