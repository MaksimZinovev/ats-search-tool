# DESIGN.md — ATS Search Tool

Ollama-derived monochrome system (source: `/Users/maksim/repos/open-design/design-systems/ollama/DESIGN.md`), adapted for a dense product-registry surface. Register: **product** (see PRODUCT.md).

## Theme & atmosphere

Pure-white workspace, flat paper feel: depth from 1px borders and background shifts only. **Zero shadows, zero gradients anywhere.** No transitions on hover; only the loading pulse animates state.

## Tokens

| token | value | role |
|---|---|---|
| `--ink` | `#000000` | h1, Search CTA bg |
| `--ink2` | `#262626` | body text, posting links, chips text |
| `--text` | `#404040` | button text |
| `--mid` | `#525252` | counts, summary, vbusy |
| `--stone` | `#737373` | secondary labels, hints, headers |
| `--silver` | `#a3a3a3` | placeholders, empty states, muted score cells |
| `--bg` | `#ffffff` | page + inputs + tooltip bg |
| `--snow` | `#fafafa` | panels/containers |
| `--line` | `#e5e5e5` | borders, active tab, region chip bg |
| `--line2` | `#d4d4d4` | white-pill button borders, tooltip border |
| `--hover` | `#ececec` | hover background everywhere |
| `--ring` | `#3b82f6 @50%` | keyboard focus ONLY (the one sanctioned chrome color) |
| `--err/--warn` | `#b3261e/#b06000` | semantic states (blocked, dead, warnings) |

## Typography

- Headings: `SF Pro Rounded` weight 700, h1 30px/1.05 `-.02em` (user-directed "bolder title"; the sole weight >500 in the system, and every other heading stays ≤500); panel titles 12px uppercase Stone.
- Header copy: three lines (`.lead` 15px ink, `.how` 13px mid, `.trust` 12px stone), each capped at 68ch; inline code (`site:`) = mono in a gray pill chip.
- Body/UI: `ui-sans-serif` 13–14px/1.5; weights ≤500 only (no bold).
- Data: `ui-monospace` (counts, scores, timestamps).

## Geometry (binary)

- **12px radius**: panels, details containers, tooltips.
- **9999px pills**: every button, input, tag (sort tabs, region chips, score cells, G/↻ buttons, history items).
- Nothing between 12 and 9999. Borders always 1px.

## Components

- **Search CTA**: black pill, white text, 10×24, hover `#262626`.
- **Secondary buttons**: white pill, `#404040` text, `#d4d4d4` border, hover `#ececec`.
- **Tab pills (pages/jobs sort)**: transparent inactive (Stone text), active = Light Gray pill.
- **Region chips**: `AU · NSW` gray pill tags next to platform names.
- **Platform rows**: flat list, 1px dividers, ▸/▾ chevron, zero-dimmed at 55% opacity.
- **Score cells: the one chromatic exception** — pale green `#e6f4ea/#137333` pass, pale amber `#fef7e0/#b06000` borderline, pale red `#fce8e6/#b3261e` fail, Silver text = unclear/snippet-only, white + dashed red border = fetch blocked (✕).
- **Tooltips**: white, 1px `#d4d4d4`, 12px radius, 280px — flat, no shadow.
- **Focus**: blue 3px ring on `:focus-visible` only (Ollama's sanctioned Ring Blue).

## Layout

Two columns max: 340px sidebar + results, 24px page gutters, 8px base spacing scale. Panels Snow on white page.

## Motion

Pulse (loading) only, 150ms tooltip fade. `prefers-reduced-motion`: pulse off, tooltip instant.