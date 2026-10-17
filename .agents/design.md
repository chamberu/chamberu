# Design

The visual identity of the docs site, the logo and the README artwork. The source of truth for tokens is `packages/docs/src/.vitepress/theme/style.css` (`--ch-*` variables); this page records the decisions behind them so new pages, diagrams and assets stay consistent.

## Direction

"Crimson": a wax-seal crimson on charcoal. Dark mode is the reference look; light mode is crimson on cool white (no sand, no teal). Crimson is a signal colour (primary actions, the running status, links, the logo), not a fill for large areas, so warnings and errors never read as branding.

## Tokens

| Token | Light | Dark |
|---|---|---|
| Hero surface | `#f4f4f5` | `#19171a` |
| Fixed-dark surfaces (footer, code blocks) | `#19171a` | `#19171a` / `#121012` (code) |
| Page | `#ffffff` | `#201d1f` |
| Ink | `#1b1a1c` | `#efe8e6` |
| Muted ink | `#5c5b60` | `#b0a5a4` |
| Line | `#e6e6e9` | `#332e30` |
| Chip | `#f0f0f2` | `#2c2729` |
| Accent (running status, chips) | `#c8303b` | `#e04652` |
| Primary button (white text, 5.3:1) | `#c8303b` | `#c8303b` |
| Accent text (links, eyebrows) | `#b02a34` | `#ff7b84` |
| Code ink / keyword / string / comment | `#e6dfde` / `#ff7b84` / `#e7c58c` / `#958a8b` | same |

Keep text contrast at 4.5:1 or more; the primary button and code comment colours were chosen for that.

## Type and shape

- Display: **Bricolage Grotesque** 700, letter-spacing -0.025em (hero, section headings, doc H1/H2).
- Body: **IBM Plex Sans**. Code and labels: **IBM Plex Mono**.
- Corners: 4px radius everywhere, except square corners (0) for status chips and approval callouts, which read as "signed".

## Logo and artwork

- The logo is three arched chambers on one floor, one per agent, each holding the steps its run has checkpointed; the middle chamber is the running one.
- Colours: the arches use the crimson accent, the floor and step pills use the ink (`#1b1a1c` light, `#ede6e3` dark), the pending step pill a warm grey.
- `.github/assets/*.svg` are theme-aware through a `prefers-color-scheme` style block inside the SVG. The docs use fixed `logo-light.svg` / `logo-dark.svg` (and the lifecycle diagram variants) switched by the site's colour mode, because an SVG in an `<img>` follows the OS setting, not the site toggle.
- GitHub org avatar and repo social preview are PNG renders of the dark logo (charcoal background); regenerate them when the logo changes.

## Landing page

Sections in order: hero (eyebrow "Self-hosted agents", headline "Agents that keep the keys.", README pitch, typechecked `defineAgent` sample) → feature row → how a run flows (lifecycle diagram) → packages (shipped vs planned) → closing call to action → site-wide dark footer. The nav is transparent over the hero at the top of the page.
