# Handoff: Contour — brand mark & favicon

## Overview
**Contour** is a browser-based, drag-and-drop editor for visually building metadata schemas (it generates SHACL / Turtle-RDF). This package delivers the approved **logo identity** — the icon, the horizontal lockup, and the browser-tab favicon — plus the color and type tokens needed to adopt it across the application.

The approved direction is **"Linked contours"**: nested contour "C" rings (the cartographic read that gives the name its logic) where the **outer ring resolves into a connected-node graph** — a direct visual reference to RDF / Linked Data and the drag-and-drop canvas.

## About the design files
The files in this bundle are **design references and ready-to-use vector assets**:
- The `.svg` / `.png` files in `assets/` are **production-ready** — drop them straight into the app (`public/`, `src/assets/`, etc.).
- `contour-brand-reference.html` is a **static reference sheet** (a prototype showing intended look), not code to ship. Recreate any in-app UI it implies using the codebase's existing framework and patterns.
- `Contour Logo Exploration.dc.html` is the original exploration prototype (all four directions), included for context only.

Your task is to **adopt these brand assets in the target codebase's existing environment** (React, Vue, Svelte, plain HTML, etc.) using its established conventions — or, if none exists yet, to wire them into the most appropriate setup.

## Fidelity
**High-fidelity.** Colors, geometry, and typography are final. The SVGs are the source of truth — match them exactly. Do not redraw the mark by hand; use the provided files.

---

## The mark

### Construction
- Canvas: `viewBox="0 0 100 100"`, centered at (50, 50).
- Three nested **open "C"** rings, each opening ~95° to the **right (east)**:
  - **Outer ring — node graph** (radius ≈ 34): 6 nodes connected by straight segments (`polyline`). This is the Linked-Data layer, drawn in **teal**.
  - **Middle contour** (radius 24): smooth stroked arc, **navy**.
  - **Inner contour** (radius 14): smooth stroked arc, **navy**.
- Stroke weights (at the 100-unit scale): contour arcs `5.5`, node connector `3.4`, node circles `r=4.6`. `stroke-linecap="round"`, `stroke-linejoin="round"`.
- The mark is two-colour but **degrades to a single colour cleanly** (see `contour-icon-mono.svg`) and stays legible down to **16 px**.

### Clear space & minimum size
- **Clear space:** keep padding of at least 25% of the icon's width clear on all sides (≈ one node-ring gap). The bounding box of the artwork already sits ~15 units inside the 100-unit canvas.
- **Minimum size:** icon 16 px (favicon-proven). Horizontal lockup minimum width ≈ 120 px.

---

## Assets (in `assets/`)

| File | Use |
|---|---|
| `contour-icon.svg` | Primary two-colour mark (navy + teal), transparent background. App headers, login, marketing. |
| `contour-icon-mono.svg` | Single-colour mark via `currentColor` — inherits text color. Use where one colour is required. |
| `contour-icon-256.png` | Raster fallback of the colour mark (256 px, transparent). |
| `contour-lockup-horizontal.svg` | Mark + "Contour" wordmark + tagline. **Wordmark = IBM Plex Sans, tagline = IBM Plex Mono.** |
| `favicon.svg` | **Browser-tab icon.** Navy rounded tile + white contour + teal nodes — holds contrast on light *and* dark tabs. |
| `favicon-16.png` / `favicon-32.png` / `favicon-48.png` | PNG favicons (navy tile). |
| `apple-touch-icon-180.png` | iOS/Safari home-screen icon (180 px). |

> **Lockup font note:** SVG `<text>` only renders correctly where IBM Plex Sans / IBM Plex Mono are available. For a guaranteed-portable lockup, either (a) outline the text in your design tool, or (b) **rebuild the lockup in markup** — place `contour-icon.svg` next to live HTML text styled with the type tokens below (preferred for apps; keeps the wordmark crisp and translatable).

---

## Browser-tab icon — implementation

Copy the favicon files into the app's `public/` (or static root) and add to `<head>`:

```html
<!-- Modern browsers: scalable, sharp at any DPI -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<!-- PNG fallbacks -->
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<!-- iOS / Safari home screen -->
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png" />
```

Optionally generate a multi-resolution `favicon.ico` (16/32/48) from the PNGs for legacy support.

The favicon intentionally uses a **navy tile** rather than a transparent mark so it stays legible regardless of the browser's tab background (a transparent navy mark would disappear on dark-themed tabs).

---

## Design tokens

### Color
| Token | Hex | Use |
|---|---|---|
| `--ink` / primary | `#1B2A4A` | Contour strokes, wordmark, primary text on light |
| `--node` / accent | `#0E7C7B` | Node graph, tagline, accents on light |
| `--node-bright` | `#2BB3AB` | Node graph / accent on **dark** surfaces & favicon tile |
| `--ink-on-dark` | `#E6E8EE` | Contour strokes & wordmark on dark |
| `--favicon-tile` | `#1B2A4A` | Favicon background tile |
| mono dark | `#141414` | Single-colour mark on light |
| mono light | `#FFFFFF` | Single-colour mark on dark / knockout |

Supporting neutrals used in the brand sheet (optional, for surfaces):
`#EAE7E0` sand bg · `#FCFBF8` card · `#FFFFFF` tile · `#E4E0D6` / `#ECE8DE` borders · `#5C5F68` muted text · `#A6A29A` faint label.

### Typography
| Role | Family | Weight | Tracking | Notes |
|---|---|---|---|---|
| Wordmark | **IBM Plex Sans** | 600 | `-0.015em` | "Contour" |
| Headings / UI titles | IBM Plex Sans | 600 | `-0.01em` | |
| Body / UI | IBM Plex Sans | 400–500 | normal | |
| Tagline & labels | **IBM Plex Mono** | 500 | `0.17em`, UPPERCASE | "Visual schemas. Clean SHACL." |

Load (Google Fonts):
```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

### Tagline
> **Visual schemas. Clean SHACL.**

Set in IBM Plex Mono, uppercase, teal (`#0E7C7B` on light / `#2BB3AB` on dark). Use as the lockup descriptor and README/site header.

---

## Usage do / don't
- **Do** keep the mark's two-colour navy + teal relationship; use the mono version only when colour isn't possible.
- **Do** preserve clear space and the rightward "C" opening.
- **Don't** recolour the nodes a different hue from the connector, restretch/skew the mark, add effects/shadows, rotate it, or re-typeset the wordmark in another family.
- **Don't** place the transparent mark on a low-contrast background — use the tile favicon for tabs.

---

## Files in this package
```
design_handoff_contour_brand/
├── README.md                         ← this file
├── contour-brand-reference.html      ← static brand sheet (open in a browser)
├── assets/
│   ├── contour-icon.svg
│   ├── contour-icon-mono.svg
│   ├── contour-icon-256.png
│   ├── contour-lockup-horizontal.svg
│   ├── favicon.svg
│   ├── favicon-16.png
│   ├── favicon-32.png
│   ├── favicon-48.png
│   └── apple-touch-icon-180.png
└── Contour Logo Exploration.dc.html  ← original exploration (all 4 directions, context only)
```
