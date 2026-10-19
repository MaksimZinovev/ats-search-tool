# ATS Search Tool

Local job-search command center: enter role keywords + optional location, see
**result counts across 18 ATS job-board platforms** on one page — links open
on Brave (G = Google), and TypeSafe AI filters raw page counts down to
**"pages · real jobs"**.

Runs 100% locally. Only leaves your machine: search queries to Brave/TypeSafe.

## Setup

1. **Keys** — `cp .env.example .env`, then fill in:
   - `BRAVE_API_KEY` — free (2,000 queries/month): https://api-dashboard.search.brave.com
   - `TYPESAFE_API_KEY` — optional, powers job/relevance filtering: https://typesafe.ai
   Without keys the tool still generates all platform search links.
2. **Run** (Node ≥ 18, zero dependencies):
   ```sh
   node server.mjs        # → http://localhost:8787
   ```

## How counts work

- Each platform = one Brave API `site:` search, paged up to 3×20:
  **exact count ≤ 60**, then `60+`.
- **jobs**: one batched TypeSafe request per platform scores every result twice —
  `job` (is this an individual posting for an open role? ≥3/4 counts as a job)
  and `rel` (relevance to your keywords+location). Expand a row to see ranked
  matches; noise is dimmed.
- Counts are cached 24h per (query, platform) — repeat searches are instant and
  free. `↻` on a row force-refreshes that platform.
- Quota: ~1–3 Brave calls per platform per uncached search; 18 platforms ≈
  20–50 calls. With 2,000/month free that's ~40–100 uncached searches/month.

## Features

- 18 default platforms (Ashby, Greenhouse, Lever, … + Welcome to the Jungle,
  Teamtailor, Recruitee, Breezy, Pinpoint, Homerun, Workday wd1+wd3)
- **Full platform CRUD**: add/edit/hide/remove + restore defaults (localStorage)
- Boolean OR mode (comma-separated keyword variants), optional location
- Search history: last 50, click to re-run, clear
- Sort by `pages` or `jobs` (default: jobs)
- Open all in tabs (popup blockers may cap this — rows open individually)

## Why no Bing/Google totals

Bing's HTML total ("About N results") was verified unreliable from scripted
HTTP: it ignored `site:`, returned unrelated pages (wikipedia, degree symbols),
and gave 65 → 6,570 for the same query across runs. Google needs JS + captchas.
So totals come from paging the Brave API you already trust.

## Blocks (reusable scripts)

```sh
caveman-blocks run brave-count --q 'site:jobs.lever.co "qa engineer" remote'
caveman-blocks verify brave-count   # needs BRAVE_API_KEY in .env or env
```

## Troubleshooting

- **"no Brave key" on rows** — add `BRAVE_API_KEY` to `.env`, restart server.
- **Job counts missing** — no `TYPESAFE_API_KEY`; raw page counts still work.
- **Bing-era note** — anything labeled "est." was removed; `60+` is honest.

## Roadmap (not built)

- Suggested keywords + long-tail keywords via a cheap OpenRouter LLM.

Design doc: `plans/ats-search-tool-plan.md` · Progress: `agents/PROGRESS.md`