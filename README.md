# ATS Search Tool

Local job-search command center: enter role keywords + optional location, see
**AI-graded matches across 29 ATS job-board platforms** on one page — links
open on Brave, and TypeSafe grades every match on four axes.

Runs 100% locally. Only leaves your machine: search queries to Brave/TypeSafe.

## What

A one-page explorer for **direct-employer postings** — the obscure jobs that
Seek, LinkedIn and Indeed don't surface. Roles often live only on a company's
Applicant Tracking System (ATS): Greenhouse, Lever, Workday, government boards.
This tool runs one Brave `site:` search per platform, then expands any platform
row into a ranked match list.

Each platform row shows:

| Column | Meaning |
| ------ | ------- |
| pages  | result pages for `site:<domain> <keywords>` (exact ≤ 60, then `60+`) |
| jobs   | matches the AI counts as real, open postings |
| row ↗  | ranked matches, each graded 0 (poor) to 4 (strong) on four axes |

Failures stay visible. Blocked or unreachable postings are labelled with the
reason (HTTP code, timeout, bot check) and expired postings are graded **gone** —
nothing quietly disappears.

## Why

Interesting roles get posted to a company ATS and never make it onto the big
boards, or arrive there weeks later in the wrong location. Re-checking 29
boards by hand every morning is slow. This page makes one search the only
task: type keywords, click Search, expand the rows that scored.

## Quick Start

```sh
# 1. keys
cp .env.example .env    # BRAVE_API_KEY for counts; TYPESAFE_API_KEY enables AI grading

# 2. run (Node >= 18, zero dependencies)
node server.mjs         # → http://localhost:8787
```

> **Note:** without a Typesafe key the tool still generates all platform
> links and raw page counts — grading simply stays off.

Free tier: 2,000 Brave queries/month, about 1–3 per platform per uncached
search (29 platforms ≈ 30–90 calls ≈ 30–60 uncached searches/month).

## How grading works

Two passes, both fed by Brave results and the posting pages themselves:

1. **Snippet pass** (one batched call per platform): every result is graded
   `rel` (keyword relevance) and `job` (is this an individual posting for an
   open role? `job ≥ 3` counts toward `jobs`).
2. **Verify pass** (when you expand a row): each promising match's posting
   page is fetched, stripped to text and re-graded for `loc` (location fit)
   and `live` (still live now?). A deterministic gone-check runs first:
   known ATS redirect patterns dead postings emit are recognized before the
   AI is even asked.

- Counts are cached 24h per (query, platform) — repeat searches are instant
  and free. `↻` on a row force-refreshes that platform and clears its verify
  cache.
- A separate AI score for keywords vs location is deliberate: run-to-run
  variance is ±0.3–0.5; scores are a signal, not a verdict.

## Structure

```text
ats-search-tool/
├── server.mjs            # zero-dependency HTTP server: APIs, verify pass, page text
├── lib.mjs               # query building + paged Brave counting
├── index.html            # the whole UI (single file)
├── .env.example          # keys template
├── DESIGN.md             # design system (Ollama-derived monochrome)
├── PRODUCT.md            # product intent, register, principles
├── .blocks/              # reusable caveman-blocks scripts
└── agents/PROGRESS.md    # work log
```

## Platforms

29 defaults: 18 global ATS (Ashby, Greenhouse, Lever, iCIMS, Workday, BambooHR,
SmartRecruiters, JazzHR, Workable, Gem, Welcome to the Jungle, Teamtailor,
Recruitee, Breezy, Pinpoint, Homerun, …) plus 11 AU boards — state government
jobs boards (QLD/NSW/WA/TAS/NT), university PageUp boards (UniMelb, UNSW, ANU),
LiveHire, Employment Hero and EthicalJobs, each tagged with a region chip.

Some ATS hosts (NSW Jobs, LiveHire, UNSW, UniMelb) refuse scripted fetches;
their verify pass reports the exact failure instead of guessing.

## Features

- Full platform CRUD: add/edit/hide/remove + restore defaults (localStorage;
  server data always heals stale built-in entries)
- Boolean OR mode (comma-separated keyword variants), optional location
- Search history: last 50, click to re-run, clear
- Sort by `pages` or `jobs` (default: jobs); open-state preserved across sorts
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
- **Grading missing** — no `TYPESAFE_API_KEY`; raw page counts still work.
- **✕ with "bot check"** — the ATS (or its CDN) refused scripted fetches; open
  the row's links in the browser instead.

## Roadmap (not built)

- Stop button for an in-flight search (the scan currently locks the page ~30s)
- Shareable URL state (keywords/location/sort survive reload)
- Suggested keywords + long-tail keywords via a cheap OpenRouter LLM

Design doc: `DESIGN.md` · Product: `PRODUCT.md` · Progress: `agents/PROGRESS.md`