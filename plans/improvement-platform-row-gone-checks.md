# Improvement: dead platform-row links should be marked dead

## Background

"Other job boards" rows get a background gone-check (`checkBoardRows` in
`index.html`): if the live page answers 404 / "taken offline" / "no longer
available", the row shows a "no longer open" badge and its live score drops
to 0.0. Platform rows never get this treatment.

Consequence found during the spot-check walk (2026-10-25): a Workday (wd1)
link, "Software Automation QA Engineer — Mac_53716", opened to Workday's
"The page you are looking for doesn't exist" — a stale posting that still
looks clickable and graded in the tool. Posting URLs on big ATS platforms go
stale often, so this will keep happening.

## Suggested fix

Reuse what already exists rather than adding a new check pass.

Expanding a platform row already runs a verify pass: the row sends its top 10
matches to `POST /api/verify`, and `verifyPages()` in `server.mjs` fetches
each page. That fetch is a single plain GET, so Cloudflare-walled pages return
"the site blocked the fetch". Make `verifyPages()` use the reader chain from
`lib.mjs` (`providerFetch`) — the same chain the board gone-check uses (plain
GET → Ollama → Lightpanda → unknown).

Then route the verdict the way board rows do:

- HTTP 404/410, or the page text matches the `GONE` phrases → live 0.0 +
  "no longer open" badge on that match row;
- unreadable after every reader → leave the score, keep the existing
  "could not fetch" hint.

Costs stay bounded: verification runs only on expand, 10 URLs max, with the
existing pacing; Lightpanda only spawns for pages the free readers cannot
read.

## Example

Expanding the Workday row would flip the Mac_53716 line from a live-looking
score to "no longer open", the same way board rows already flip, without
adding any request when nobody opens the row.