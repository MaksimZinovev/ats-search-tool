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
| Sidebar note | other boards: off — add an API key to include them | Without this, jobs posted in the last few days can be missing. Add an API key and we ask a second set of job boards for the same search. |
| Section heading | Other job boards | — (sub-line: "3 roles found in 2 places") |
| Match marker | from a board copy | — |
| Row button | look on other boards | Asks the other job boards for results this search missed. |
| Section button | look on other boards ↻ | Asks the other job boards for results this search missed. Free, and repeated searches are cached. |
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
- The "look on other boards" button on each platform row and on the section
  heading.
- The sidebar note and the "?" marker on rows the second channel could not
  check.
- The board-copy marker on second-channel matches, and the de-duplicated
  clusters with their source links.
- **Score cells become pill elements.** The mockup showed the current markup
  turning score cells into tall rounded lozenges on any row with more than one
  line, which the board-copy rows always have. The number moves into a
  `span.pill` so the cell keeps its compact shape.
- **Tooltips in the sidebar open downwards.** The existing tooltip rule opens
  upwards, which put the explanation over the Search button. A downwards variant
  is needed for the note in the sidebar.

### 4. `config.json`

The watch list, as shown above.

### 5. `.env` and `.gitignore`

`OLLAMA_API_KEY` and `OPENROUTER_API_KEY` are already in place. `config.json`
joins `.env` in `.gitignore` so a local watch list can never be committed by
accident.

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

| Measure | Before | Target |
|---|---|---|
| Roles found that the Brave channel missed | 0 | 3 or more on the Sydney QA search |
| Board-copy rows with coloured location and freshness | 0 | every board-copy row |
| Roles counted twice | n/a | 0 |
| LLM tokens spent per search | unchanged | unchanged |
| New calls per search | 0 | 4 to 6 search calls, cached for 24 hours |

The acceptance case is the one that started this: a Quality Assurance Engineer
role in Sydney posted on 2026-10-19, visible on a job board, invisible to the
tool. After this change it must appear in the "Other job boards" section, with
its location and freshness scored, and with the employer's own posting listed
as the place to apply.

## Not in this change

- Public board APIs for Greenhouse, Lever, Ashby, Workday and SmartRecruiters.
  Verified to work without a key, and a better answer than any search engine
  for those platforms, but a separate piece of work.
- The `config.json` model settings, the free OpenRouter grader and the
  per-search accounting panel. The accounting line can appear in this change
  (TypeSafe calls with estimated tokens, plus the number of board searches)
  without any OpenRouter involvement.
- Making job boards into platform rows the user can tick on and off.
