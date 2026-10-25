# Improvement: show a Sydney-match count on platform rows

## Background

Platform rows show two numbers: PAGES (results found) and JOBS (results the AI
graded as real, open-role postings). They never say how many are actually in
the user's location. The "Other job boards" section does have this number —
its header reads "8 roles" and "5 match Sydney, NSW" — but platform rows lack
it.

Consequence found during the spot-check walk (2026-10-25): expanding the
Welcome to the Jungle row revealed a "Robinhood QA Engineer" posting located
in Toronto, plus pages about jobs in France and Morocco. The links work, but a
reader scanning the collapsed header can't tell how much is Sydney signal.

## Suggested fix

The per-page grades already exist. Each row's `r.matches` array carries a
`loc` score for every candidate, on the same 0–4 rubric the boards use (3+
means same region or matching location). So:

1. In `index.html`, where each row's JOBS count is computed
   (`r.jobs = r.matches.filter(m => (m.job ?? 0) >= 3).length`), also compute
   `r.locMatch = r.matches.filter(m => (m.loc ?? -1) >= 3).length`.
2. Render the number in the row header next to JOBS, reusing the boards'
   wording pattern (`matchN` / `matchTxt` in the boards renderer): for a
   Sydney search, "2 match Sydney"; with an empty location box, omit it.
3. No cache changes: the count derives from cached `matches`, so old cached
   rows pick it up after a regrade.

Sort note: the header should stay sortable on the existing PAGES/JOBS values;
the Sydney count is display-only for now.

## Example

Collapsed row, before: `Workday (wd1) — 20 pages · 7 jobs`.
After: `Workday (wd1) — 20 pages · 7 jobs · 2 match Sydney`.

That single number tells the reader whether expanding the row is worth it.