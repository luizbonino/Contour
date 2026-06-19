# Contour Rebrand — Implementation Plan

Rebrand the application from **Project Oak** (currently presented as a FAIR Data
Point–styled tool) to **Contour**, adopting the approved "Linked contours" brand
identity delivered in [`docs/design_handoff_contour_brand/`](docs/design_handoff_contour_brand/).

## Confirmed scope

- **Brand-faithful restyle**: navy `#1B2A4A` + teal `#0E7C7B`, IBM Plex Sans/Mono,
  warm "sand" surfaces (`#EAE7E0` / `#FCFBF8`), restyled header + accents.
- **Keep FDP as the target ecosystem**: rebrand the *product* to Contour; leave
  the default `:` namespace `http://fairdatapoint.org/` (and its passing test)
  untouched, and keep the "works with FAIR Data Point" framing.
- **Self-host + inline IBM Plex** so the single-file build still renders the brand
  fonts offline / via `file://`.
- **Out of scope**: dark mode (brand provides tokens, but the app has no dark
  theme today), renaming the GitHub repo / URLs, the default RDF namespace.

## Why this is low-risk

`grep` confirms the Vue components use only `var(--…)` tokens — **no inline hex
colors**. Brand touchpoints are limited to `src/style.css`, `src/App.vue`
(header), `index.html`, `package.json`, `README.md`, and `src/assets/`. The seed
schema (`Dataset`) and all SHACL parse/generate logic need no changes.

---

## Status

| Phase | Status |
|---|---|
| 1 — Design tokens | ✅ Done |
| 2 — Surface + accent reassignment | ✅ Done |
| 3 — Fonts (self-host + inline) | ✅ Done |
| 4 — Logo, header & title | ✅ Done |
| 5 — Copy & metadata | ✅ Done |
| 6 — Docs follow-up | ✅ Done |
| 7 — Language switch (i18n) | ✅ Done |

Verified: `npm run build` produces a single-file `dist/index.html`
(538 KB / 329 KB gzip, fonts inlined); `npm test` passes **109/109**; visual
check confirms navy+teal+sand restyle, IBM Plex, Contour lockup, dynamic tab
title (`Edit Dataset · Contour`), and the EN / PT-BR switch (locale persists,
generated Turtle identical across locales).

---

## Phase 1 — Design tokens (`src/style.css` `:root`) — ✅ Done

Remap the existing palette and add explicit teal accent tokens. Navy = structural
chrome; teal = the "linked-data" accent (icons, active states, links) — mirroring
the mark (navy contour rings + teal nodes).

| Token | Current | New |
|---|---|---|
| `--color-primary` | `#00518e` | `#1B2A4A` (ink/navy) |
| `--color-primary-lighter` | `#1a6ba8` | `#2C3E63` |
| `--color-primary-darker` | `#003a6a` | `#11203B` |
| `--color-primary-soft` | `#bfd4e3` | `#C6CEDC` |
| `--color-primary-tint` | `#e8f0f7` | `#EAEEF4` |
| `--color-complementary` | `#efc700` | folded into new teal accent (below) |
| `--color-text-dark` | `#222` | `#1B2A4A` |
| `--color-text-default` | `#4a4a4a` | `#3A3D45` |
| `--color-text-lighter` | `#9b9b9b` | `#8A8C94` |
| `--color-text-light` | `#ababab` | `#A6A29A` |
| `--color-bg` (page) | `#ffffff` | `#EAE7E0` (sand) |
| `--color-bg-canvas` | `#f7f8fa` | `#F2F0EA` |
| `--color-bg-highlight` | `#f1f1f1` | `#ECE8DE` |
| `--color-separator` / `--color-border` | `#dcdcdc` | `#E4E0D6` |
| `--font` | `'Open Sans', …` | `'IBM Plex Sans', system-ui, sans-serif` |
| `--font-mono` | `'JetBrains Mono', …` | `'IBM Plex Mono', SFMono-Regular, Menlo, monospace` |

**New tokens to add:**

```css
--color-accent: #0E7C7B;        /* teal node */
--color-accent-darker: #0A5F5E;
--color-accent-soft: #BFE0DE;
--color-accent-tint: #E6F2F1;
--color-surface-card: #FCFBF8;  /* panels, banners, cards, header */
--color-surface-input: #FFFFFF; /* form inputs, tiles */
--color-code-bg: #FAF8F3;       /* turtle / SHACL panes */
```

---

## Phase 2 — Surface + accent reassignment (`src/style.css` body) — ✅ Done

Three mechanical passes:

1. **Surface split** — replace literal `#fff` / `#ffffff` backgrounds on
   *containers* (`.panel`, `.target-banner`, `.group-card`, `.field`,
   `.preview-pane`, `.legacy-form`, header) with `var(--color-surface-card)`;
   leave form inputs on `var(--color-surface-input)`. Body background → sand.

2. **Hardcoded-blue sweep** (fully enumerated — these exact lines in the current
   `style.css`):

   | Line(s) | Current | New |
   |---|---|---|
   | 396, 498 | `rgba(0, 81, 142, 0.08)` | `rgba(27, 42, 74, 0.08)` (selected-state rings) |
   | 791, 1235 | `rgba(0, 81, 142, 0.12)` | `rgba(27, 42, 74, 0.12)` (focus rings) |
   | 662 | `#dbe9f5` | `#DCEEEC` (nested-header hover) |
   | 1274 | `#dde3eb` | `#D8D3C8` (scrollbar thumb) |
   | 168, 1177 | `#5a4a00` | `#fff` (`.tag-new` / `.loaded-badge` text — now white on teal) |
   | 911, 972, 1009, 1221 | `#fbfcfd` | `var(--color-code-bg)` |

3. **Teal accent application** — point these at `--color-accent` / `-tint` /
   `-soft`: palette + field icon squares (`.palette-item__icon`, `.field__icon`),
   active tab underline (`.nav-link.active`), `.tag-new` / `.loaded-badge` /
   `.tabs-callout` left border (was yellow), `.tag` chips,
   `.form-preview__add-btn`, `.drop-indicator`, and group-header label/border
   (`.group-card__header`). **Selection & focus rings stay navy** for calm,
   consistent chrome.

> Turtle syntax-highlight colors (lines ~974–1004) are functional, not brand —
> left as-is. Optional: tune `tok-num` to navy.

---

## Phase 3 — Fonts (self-host + inline) — ✅ Done

> Implemented with the **static** `@fontsource/ibm-plex-sans` + `@fontsource/ibm-plex-mono`
> latin weights (sans 400/500/600/700, mono 400/500/600), imported in
> `src/main.ts`. Latin-only keeps the inlined payload to ~144 KB and still covers
> Brazilian-Portuguese diacritics. (Switched away from the variable package,
> whose CSS pulls every script — Cyrillic/Greek/Vietnamese — which would all
> inline.)

- `npm i @fontsource-variable/ibm-plex-sans @fontsource/ibm-plex-mono` (latin
  subset).
- In `src/main.ts`, import the CSS (variable sans; mono weights 400/500/600),
  e.g. `import '@fontsource-variable/ibm-plex-sans';`.
- `assetsInlineLimit: Infinity` (already set in `vite.config.ts`) inlines the
  `woff2` as base64 into the bundle, and `viteSingleFile` folds it into
  `index.html` → brand fonts work offline.
- **Verify** the dist size delta (~100–250 KB expected; acceptable per the
  self-host decision).

---

## Phase 4 — Logo, header & title (`src/App.vue`, `index.html`, assets) — ✅ Done

- Copy `contour-icon.svg` (+ `contour-icon-mono.svg`) into `src/assets/`; delete
  `src/assets/fdp-logo.png`.
- Copy `favicon.svg`, `favicon-16/32/48.png`, `apple-touch-icon-180.png`,
  `contour-icon-256.png` into `public/`.
- **Header**: replace the `fdpLogo` `<img>` with the markup-based lockup
  (handoff's preferred approach): `contour-icon.svg` + a styled `Contour`
  wordmark + the `VISUAL SCHEMAS. CLEAN SHACL.` tagline (IBM Plex Mono,
  uppercase, teal). Add `.brand__wordmark` / `.brand__tagline` rules.
- Rename `.fdp-*` classes → `.app-*` (header / page / logo) in `App.vue` +
  `style.css` (~16 lines; removes misleading "fdp" naming). Optional but
  recommended for a clean rebrand.
- **`index.html`**: `<title>` → `Contour — Visual SHACL editor`; inline the
  **favicon as a `data:` URI `<link rel="icon">`** (survives the single-file
  build / `file://`), plus PNG + apple-touch `<link>`s for hosted deployments.

  > Note: `viteSingleFile` does **not** embed `public/` files, so the inlined SVG
  > data-URI is what works in the standalone file; the PNGs serve the
  > GitHub-Pages / Netlify deployment path.

- Optional nicety: set `document.title = \`Edit ${schemaName} · Contour\`` via a
  watcher in `App.vue`.

---

## Phase 5 — Copy & metadata — ✅ Done

- `package.json`: `description` → "Contour — visual SHACL schema editor for the
  FAIR Data Point ecosystem"; optionally `name` → `contour`.
- `README.md`: title `# Visual SHACL Editor` → `# Contour` + tagline; **keep** the
  FDP-ecosystem sentence and the release URLs.

---

## Phase 6 — Docs follow-up — ✅ Done

> Product renamed to **Contour** in the guide prose; all 20 screenshots
> regenerated from the rebranded build; added an "Interface language" subsection
> with a PT-BR screenshot.

- `docs/data-steward-guide.md`: rename the product in prose ("Visual SHACL
  Editor" → "Contour").
- The guide's **20 screenshots show the old FDP header / blue theme** and will be
  stale. Regenerate them with the Playwright harness (`shoot.mjs` / `shoot2.mjs`,
  in the session scratchpad) once the UI lands.

---

## Phase 7 — Language switch (i18n: English / Brazilian Portuguese) — ✅ Done

> Implemented the lightweight custom-composable option: `src/composables/useI18n.ts`
> (reactive module-level `locale`, dotted-key `t()` with English fallback, `plural()`,
> localStorage persistence under `contour.locale`) + catalogs `src/i18n/en.ts`,
> `src/i18n/pt-BR.ts`, `src/i18n/index.ts`. Header EN/PT toggle. All UI chrome
> externalized across App, Canvas, Inspector, Palette, FormPreview, FieldCard,
> FieldInput, PrefixEditor, InValuesEditor; widget catalogue localized via
> `widget.<id>.name/desc` and `category.<name>` keys. `data.ts` unchanged (English
> remains the fallback source).

Add a UI language switcher offering **English (default)** and **Brazilian
Portuguese (`pt-BR`)**. Independent of the rebrand, but the switcher control
should adopt the new Contour header styling — sequence it after Phase 4.

**Translate UI chrome only.** Do **not** translate: user data (schema
name/description, field labels/paths, prefix values), SHACL/Turtle keywords,
`dash:` editor identifiers, datatypes, or node kinds — these are technical and
must stay byte-identical in the generated output.

Steps:

- **i18n mechanism.** Two options:
  - *(a, recommended)* a small custom composable `src/composables/useI18n.ts`
    (reactive `locale` ref + `t(key, params?)` lookup + a tiny `plural()`
    helper) — honours the project's minimal-dependency ethos (only `vue` is a
    runtime dep today and the build is a single self-contained file).
  - *(b)* add `vue-i18n` for built-in pluralization/interpolation, if string
    volume or formatting needs grow.
- **Message catalogs**: `src/i18n/en.ts` and `src/i18n/pt-BR.ts` (keyed
  dictionaries) + `src/i18n/index.ts` exporting the registry.
- **Persistence**: store the choice in `localStorage` (e.g. `contour.locale`);
  default `en`; initialize before mount in `src/main.ts`.
- **Switcher control** in the header file-toolbar (`.app-header`) — an
  `EN / PT-BR` segmented toggle or a small `<select>`; keyboard-accessible.
- **Externalize hardcoded strings** to `t('…')` across:
  - `App.vue` — tabs, callouts, Open/Save/Save As, hints, nav "Metadata
    Schemas", "Edit … Metadata Schema", preview titles, actions bar.
  - `Canvas.vue` — "Form canvas", add-group / add-nested buttons, drop-zone
    copy ("Drop a widget here", "Drop widgets here to design your form"),
    "Nested shapes", and the count strings.
  - `Inspector.vue` — section titles (Basic / Constraints / Defaults & order /
    Identity / Shape definition / Vocabularies) and every label, placeholder,
    hint, and delete button.
  - `Palette.vue` — "Widgets", subtitle, search placeholder, category labels.
  - `FormPreview.vue` — empty-state copy, "+ Add".
  - `PrefixEditor.vue` / `InValuesEditor.vue` — placeholders, "Allowed values",
    helper text.
- **Widget catalogue (`data.ts`)**: keep widget `id`s stable; move display
  `name` / `desc` / `category` to i18n keys looked up by id (e.g.
  `widget.TextFieldEditor.name`) so the palette and inspector localize.
- **Pluralization**: handle "property/properties", "group/groups",
  "shape/shapes", "field/fields" (and their pt-BR forms) via the catalog /
  `plural()` helper.
- *Optional*: localize `document.title` and the in-page H1 verb
  ("Edit" / "Editar").

Out of scope: localizing the seed `Dataset` schema content (user data), the
data-steward guide (`docs/`), and RTL layouts.

---

## Verification

- [x] `npm test` — vitest green, **109/109** (namespace unchanged → the
      `shacl.parse` test asserting `http://fairdatapoint.org/` still passes).
- [x] `npm run build` — single-file `dist/index.html` 524 KB / 326 KB gzip;
      re-ran the Playwright harness against it to eyeball the new look.
- [x] Contrast spot-check: white-on-teal and teal/navy-on-sand pass WCAG AA.
- [x] Favicon renders on both light and dark browser tabs (navy tile).
- [x] Single-file `dist/index.html` opened via `file://` still shows brand fonts
      (fonts inlined, not CDN).
- [x] Switching to pt-BR translates all UI chrome; the choice survives a reload;
      first load defaults to English.
- [x] Generated SHACL/Turtle is byte-identical across locales (no technical term
      translated).

---

## ⚠️ Environment caveat

In the current sandbox, `npm run dev` and `npm run build` fail — esbuild cannot
spawn its service process. Phases 1–5 are pure source edits that can be made here,
but **building, re-screenshotting, and verifying the font-inlined output require
an environment where esbuild runs** (e.g. a local machine). Screenshots for
Phase 6 were originally captured against the prebuilt `dist/` for this reason.

---

## Suggested execution order

1. Phases 1–5 in one pass (source edits).
2. Locally: `npm install` (for `@fontsource/*`), `npm run build`, `npm test`.
3. Regenerate doc screenshots (Phase 6) from the built UI.
4. Phase 7 (i18n) — can be done in the same pass or shipped independently;
   sequence the header switcher after Phase 4 so it matches the Contour styling.

## File-change summary

| File | Change |
|---|---|
| `src/style.css` | Token remap (Phase 1) + surface/accent/blue sweep (Phase 2) + font vars + header classes |
| `src/main.ts` | Import `@fontsource` CSS (Phase 3) |
| `src/App.vue` | Header lockup markup, drop `fdpLogo`, rename `.fdp-*` classes |
| `index.html` | `<title>`, inlined favicon `data:` URI + PNG `<link>`s |
| `vite.config.ts` | No change (`assetsInlineLimit: Infinity` already set) |
| `package.json` | `description` (+ optional `name`), `@fontsource/*` deps |
| `README.md` | Product name + tagline |
| `src/assets/` | Add `contour-icon.svg` (+ mono); remove `fdp-logo.png` |
| `public/` | Add favicons, apple-touch, `contour-icon-256.png` |
| `docs/data-steward-guide.md` | Product name in prose; regenerate screenshots |
| `src/i18n/` | **New** — message catalogs (`en.ts`, `pt-BR.ts`, `index.ts`) (Phase 7) |
| `src/composables/useI18n.ts` | **New** — locale state + `t()` + `plural()` (or add `vue-i18n`) (Phase 7) |
| `src/main.ts` | Also: init locale from `localStorage` before mount (Phase 7) |
| `src/App.vue` (+ `Canvas`, `Inspector`, `Palette`, `FormPreview`, `PrefixEditor`, `InValuesEditor`) | Phase 7: externalize UI strings to `t('…')`; add header language switcher |
| `src/data.ts` | Namespace **unchanged**; widget display strings (`name`/`desc`/`category`) externalized to i18n keys (Phase 7) |
| `src/__tests__/` | **No change** |
