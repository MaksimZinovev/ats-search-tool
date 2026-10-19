# ATS Search Tool

## Product

A local, single-file tool for finding **obscure job postings** — direct-employer ATS and niche-board pages that Seek, LinkedIn and Indeed don't surface (the hidden market). One light page: enter keywords + location, get per-platform result counts across 29 job-board/ATS domains, expand a platform row to see its ranked matches with four graded signals (rel, job, loc, live) verified from the actual posting pages.

- **Who**: the owner — a developer job-hunting in Australia (Sydney first region tag).
- **Why**: big boards hide, mislocate and expire postings; direct ATS pages hold the truth but must be fetched and graded.
- **How**: zero npm dependencies; node server + Brave/TypeSafe APIs; native `<details>`, CSS tooltips; 24h caches; keys never displayed.

## Register

**Product** — design serves the task. Density where it helps, familiar affordances, failures loud.

## Brand personality

Quiet, flat, monochrome tool (Ollama-derived system): pure white, 1px light-gray borders, zero shadows, SF Pro Rounded headings, pill-shaped controls, instant interactions. Honesty over polish: blocked fetches, dead postings and unknowns are stated visibly, never smoothed away.

## Strategic design principles

1. **Truth over polish** — every failure mode (expired, wrong location, blocked, no key) has a visible, labelled state. No silent "unclear".
2. **Zero-chrome flatness** — depth from content hierarchy and 1px borders only; no shadows, no gradients, no glass.
3. **Binary geometry** — 12px containers, 9999px pills; nothing in between.
4. **Minimal semantic color** — grayscale chrome; chromatic color appears only where it encodes graded score data (score cells, blocked ⚠/✕, focus ring). This is the single deliberate break from the Ollama grayscale, because score colors carry meaning the tool exists to show.
5. **Native platform features** — `<details>`, CSS `::after` tooltips, system fonts; libraries only when a UX win is certain.

## Anti-references

- Cream/sand SaaS dashboards and card-grids of icons
- Gradient-text or gradient-accent marketing chrome
- Glassmorphism admin panels
- The previous Google-blue default theme (the thing this system replaces)