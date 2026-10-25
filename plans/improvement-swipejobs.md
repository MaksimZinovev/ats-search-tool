# Improvement: should the tool search SwipeJobs?

## Background

During the spot-check walk of the "Other job boards" feature (2026-10-25), the
user's wanted-board list included `swipejobs.com`. It is missing from the
tool's platform list, which lives in `PLATFORMS` in `lib.mjs` (each entry is
`[id, label, domain]`). Every other board on that list is already covered.

## What the site actually is (checked 2026-10-25)

- `https://www.swipejobs.com/jobs` renders an empty shell and points users to
  a `/coming-soon` page. The page reads: "Live across the US and UK … More
  regions are on the way."
- `https://jobs.swipejobs.com` is the older US product: "Gig work with W-2
  benefits" — W-2 is United States employment, so its postings are US-only.
- The main site redirects `uk.swipejobs.com` and `au.swipejobs.com` back to
  the homepage.

So today there is no Australian job index to search, and a query like
`site:swipejobs.com "qa engineer" Sydney` has nothing to find.

## Suggested fix

Do not add SwipeJobs to `PLATFORMS` yet. Instead:

1. Record the decision here (this file) so a future reader knows why the
   platform is absent.
2. Re-check when SwipeJobs launches a regional board: run the tool's own
   Brave search with `site:swipejobs.com` plus a known role title, and a
   `lightpanda fetch --dump markdown https://www.swipejobs.com/jobs` render.
   If real postings appear, add
   `["swipejobs", "SwipeJobs", "www.swipejobs.com"]` to `PLATFORMS` and run
   one search to confirm rows appear.
3. Until then, an empty platform row would only add noise for every search,
   so keeping it out is the honest choice.

## Example

After relaunch, a search for "qa engineer" + Sydney should produce a
"SwipeJobs" row with a page count, exactly like the Workday rows do today.