# Contour — Implementation Plans

This file tracks Contour's implementation plans. The **active** plan is the
**SHACL Editor Enhancements** below (derived from the SHACL / form-generation
review). The completed **Rebrand** plan is archived at the end for reference.

- [SHACL Editor Enhancements](#shacl-editor-enhancements--implementation-plan) — **active**
- [Contour Rebrand](#contour-rebrand--implementation-plan-archived--done) — ✅ done (archived)

---

# SHACL Editor Enhancements — Implementation Plan

Improve Contour's **correctness, safety, expressiveness, and UX** as a SHACL
form-design tool, and replace the hand-rolled regex parser with a real RDF
engine that can **ingest and emit multiple RDF syntaxes**.

## Guiding principles

- **Don't corrupt the steward's work.** Open → edit → save must never silently
  drop SHACL the tool doesn't model. Correctness/safety beats new features.
- **Preserve the brand promise.** "Visual schemas. Clean SHACL." — Turtle output
  stays clean and hand-formatted; new schemas are **Turtle by default**.
- **Respect the ethos.** Zero backend, single self-contained build, minimal
  runtime deps. New deps must earn their bundle weight; heavy ones are opt-in.
- **Ship safety first.** Phases 1–2 are non-negotiable; Phases 3–6 are
  deliberate, opt-in scope.

## Status

| Phase | Theme | Status |
|---|---|---|
| 1 — Safety & correctness quick-wins | undo, autosave, bug fixes, linting, ranges | ✅ Done |
| 2 — RDF engine + multi-syntax + lossless round-trip | real parser, syntax toggle, preserve-unknown | ✅ Done |
| 3 — Form fidelity & linking UX | messages/severity, preview fidelity, nested linking | ✅ Done |
| 4 — Expressiveness | language tags, sh:or / qualified, rich paths | ✅ Done (common cases; complex stays residual) |
| 5 — Structure & scale | peer shapes, navigator, drag-order, a11y, autocomplete | 🟡 a11y/order/autocomplete/hygiene done; navigator + peer shapes pending |
| 6 — Optional / opt-in | JSON-LD & RDF/XML syntaxes, sample-data validation | ⬜ Not started |

## Priority map (from the review)

| Rec | Finding | Phase | Impact | Effort |
|---|---|---|---|---|
| Preserve-or-warn on unknown SHACL | F1 | 2 | ★★★ | M |
| Undo / redo | U1 | 1 | ★★★ | S |
| localStorage autosave + recent schemas | U2 | 1 | ★★★ | S |
| Fix `sh:in` IRI enums + serialize description | F2, F3 | 1 | ★★★ | S |
| Live validation / issues panel | U3 | 1 | ★★★ | M |
| Value-range constraints | F5 | 1 | ★★ | S |
| Real RDF parser + multi-syntax I/O | F10 | 2 | ★★★ | L |
| `sh:message` / `sh:severity` + preview | F7, U4 | 3 | ★★ | M |
| Create-&-link nested shape from field | U5 | 3 | ★★ | S |
| Click/keyboard add + drag-reorder (a11y) | U6, U7 | 5 | ★★ | M |
| Peer top-level shapes + shape navigator | F4, U8 | 5 | ★★ | L |
| Language-tagged labels (`@en`/`@pt`, `languageIn`) | F8 | 4 | ★★ | M |
| `sh:or` / qualified shapes; rich paths | F6, F9 | 4 | ★ | L |

## Key technical decisions

1. **RDF library = [N3.js](https://github.com/rdfjs/N3.js).** Parses & serializes
   Turtle, N-Triples, TriG, and N3 with essentially no transitive deps — the
   "few RDF syntaxes" the toggle needs, without breaking the single-file ethos.
   JSON-LD (`jsonld`) and RDF/XML (`rdfxml-streaming-parser`) are **heavier and
   deferred to Phase 6** as opt-in.
2. **Graph-backed round-trip with a residual store.** Parse any syntax → N3
   `Store`. Project the editable `Schema` from known SHACL/DASH quads, recording
   each element's **source term** (blank node / IRI). Everything not consumed by
   the projection is the **residual store** and is preserved verbatim. On
   output: model → quads ∪ residual → serialize. This is what actually fixes F1.
3. **Keep the custom Turtle pretty-printer for the model.** "Clean SHACL" is a
   brand promise N3.Writer's formatting won't match. Turtle output =
   hand-printed model + residual appended in a clearly-commented block. **Other
   syntaxes** (N-Triples/TriG/N3, later JSON-LD/RDF-XML) serialize the whole
   graph via the library — clean formatting is a Turtle-specific concern.
4. **Turtle is the default** for new schemas and the initial toggle state.
5. **Autosave is local-only** (`localStorage`), consistent with zero-backend.

> **Open trade-offs (acceptable defaults chosen; revisit if needed):**
> N3.js adds ~50–150 KB to the inlined bundle (acceptable). Residual-graph
> preservation means re-saving a hand-authored file may reorder/normalise the
> *unknown* portion — documented as expected. If full byte-fidelity becomes a
> requirement, escalate to a quad-diff write-back model (bigger rewrite).

---

## Phase 1 — Safety & correctness quick-wins ✅

High impact, low effort, mostly independent of the parser rewrite. Shipped.

> **Verified:** `npm test` **125/125** green (was 109; added IRI-enum,
> description, range round-trip, and validation tests); `npm run type-check`
> clean; `npm run build` produces the single-file `dist/index.html`
> (559 KB / 335 KB gzip).

### 1a. Undo / redo (U1) — ✅
- [x] Bounded history stack in [`useSchema.ts`](src/composables/useSchema.ts):
      pre-mutation snapshot on each `mutate()`, `undo()` / `redo()`, redo cleared
      on new mutations, 100-entry cap.
- [x] `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` (ignored while focused in a text
      control so native edit-undo still works) + header buttons in
      [`App.vue`](src/App.vue), disabled when stacks are empty.
- [x] Coalesce rapid same-key edits (typing in one field) into one history step
      via an optional `coalesceKey` on `mutate()`, threaded through the Inspector.
- [x] Snapshot-based design (no per-rule tests needed; covered by manual + the
      immutable store contract).

### 1b. localStorage autosave + recent schemas (U2) — ✅
- [x] Debounced (600 ms) draft persistence to `localStorage` (`contour.draft`)
      via [`usePersistence.ts`](src/composables/usePersistence.ts); restored on
      load behind a dismissible "Restored your unsaved draft" banner.
- [x] **Recent schemas** list (name + timestamp + schema), recorded on save,
      surfaced in a header **Recent** menu next to **Examples**.
- [x] "New" clears the draft; load-example / file-open reset the banner.

### 1c. Fix `sh:in` IRI enumerations (F3) — ✅
- [x] Modelled enum items as `InValue = { value, kind: 'literal' | 'iri' }`
      ([types.ts](src/types.ts)).
- [x] Parser tokenizes `sh:in ( … )` capturing IRIs/CURIEs and literals
      ([shacl.ts](src/shacl.ts) `parseInList`).
- [x] Generator emits IRIs unquoted, literals quoted.
- [x] [`InValuesEditor.vue`](src/components/InValuesEditor.vue) lets each value be
      tagged literal vs. IRI (toggle on the tag).
- [x] Round-trip tests for both literal and IRI enums.

### 1d. Serialize the schema description (F2) — ✅
- [x] `generateShacl` emits `dct:description`; parser reads `dct:description` /
      `rdfs:comment` back.
- [x] Removed the ephemeral re-injection workaround in `App.vue`.
- [x] Round-trip test for description.

### 1e. Value-range constraints (F5) — ✅
- [x] Added `minInclusive` / `maxInclusive` / `minExclusive` / `maxExclusive` to
      `Field`; parse/generate (numbers bare, dates as typed literals; decimals &
      negatives supported).
- [x] Inspector "Value range" section for Number / Date / DateTime widgets.
- [x] Reflected as `min` / `max` on the preview inputs
      ([FieldInput.vue](src/components/FieldInput.vue)).

### 1f. Live validation / issues panel (U3) — ✅
- [x] Pure-model linter [`validation.ts`](src/validation.ts): empty/duplicate
      `sh:path`, dangling/empty `sh:node`, undeclared-prefix on
      path/class/datatype/targetClass, empty `targetClass`, missing name,
      nested-shape empty/duplicate IRI, group-IRI collisions.
- [x] Non-blocking "Issues" toggle in the actions bar + click-to-focus panel
      with error/warning styling.
- [x] Unit tests per rule ([validation.test.ts](src/__tests__/validation.test.ts)).

---

## Phase 2 — RDF engine + multi-syntax + lossless round-trip ✅

Replaced the regex parser (F10) and delivered the multi-syntax toggle and
preserve-unknown round-trip (F1). The architectural heart of this plan. Shipped.

> **Verified:** `npm test` **133/133** (8 new preservation + multi-syntax tests);
> `npm run type-check` clean; `npm run build` single-file `dist/index.html`
> **740 KB / 390 KB gzip** (N3.js adds ~55 KB gzip — within the documented
> tolerance). Confirmed by eyeballing regenerated Turtle: simple properties stay
> clean inline `[ … ]`; advanced ones (sh:or + sh:message) become a labeled
> `_:n…` node with their unmodeled triples in a fenced "Preserved" tail, and the
> whole graph round-trips (Turtle ↔ TriG ↔ N-Triples).

> **Design note (what actually shipped vs. the plan):** residual is carried *on
> the model* (`Field.bnode` + `Schema.residual` N-Triples) rather than as a
> separate live store, and re-emitted as a commented N-Triples tail. This keeps
> the model JSON/localStorage-friendly (Phase 1 autosave) and the round-trip
> guarantee intact. The N-Triples tail uses full IRIs (verbose but valid and
> clearly fenced); the editable model stays clean Turtle.

### 2a. Adopt N3.js as the RDF engine — ✅
- [x] Added `n3` runtime dep; inlines into the single-file build (size delta
      recorded above).
- [x] [`src/rdf.ts`](src/rdf.ts) wraps N3 parse/serialize: `SYNTAXES`,
      `parseRdf(text, syntax)`, `serializeQuads(quads, prefixes, syntax)`,
      `shorten()`, `detectSyntax()`.

### 2b. Graph projection + residual — ✅
- [x] `storeToSchema` ([shacl.ts](src/shacl.ts)) builds the `Schema` from known
      SHACL/DASH quads, consuming them from a residual `Store`; per-property
      unknowns split off via a stable blank-node label (`Field.bnode`).
- [x] Residual = quads not consumed → serialized to N-Triples on `Schema.residual`.
- [x] Robust literals come for free (decimals, negatives, typed/boolean literals,
      language tags, triple-quoted strings — the old integer-only parsing is gone).

### 2c. Clean Turtle output preserved — ✅
- [x] Kept the hand-written Turtle pretty-printer; appends the residual graph in
      a clearly-commented `# ── Preserved … ──` block.
- [x] Non-Turtle syntaxes: `serializeSchema` re-parses the clean Turtle and
      serializes via N3.

### 2d. Multi-syntax toggle in the SHACL Code tab — ✅
- [x] Syntax `<select>` (Turtle · N-Triples · TriG · Notation3) in the SHACL Code
      header; switching re-serializes the current model.
- [x] Textarea sync is syntax-aware; parse errors carry N3's line number.
- [x] File **open** detects syntax by extension; **Save As** suggests the
      matching extension.
- [x] New schema → Turtle; autocomplete restricted to Turtle.

### 2e. Lossy-edit guardrail (F1) — ✅
- [x] Dismissible notice in the SHACL Code tab when `schema.residual` is present
      ("preserved verbatim … round-trips on save").
- [x] Tests: `parse → generate → parse` stable; `sh:or`, `sh:message`,
      shape-level predicates, and unmanaged subjects survive; Turtle ↔ TriG ↔
      N-Triples round-trips ([shacl.preservation.test.ts](src/__tests__/shacl.preservation.test.ts)).
- [x] Reworked the existing parse/roundtrip tests for the N3 pipeline.

---

## Phase 3 — Form fidelity & linking UX ✅

Made the Form Preview honest and nested shapes easy to wire up. Shipped.

> **Verified:** `npm test` **136/136**; `npm run type-check` clean;
> `npm run build` single-file `dist/index.html` 744 KB / 391 KB gzip.

- [x] **`sh:message` / `sh:severity` (F7):** added to `Field`; authored in the
      Inspector "Validation message" section (message text + Violation / Warning
      / Info); parsed & generated as first-class (so they leave the residual
      graph from Phase 2).
- [x] **Preview fidelity (U4):** extracted a recursive
      [`PreviewField.vue`](src/components/PreviewField.vue) that renders
      nested-within-nested sub-forms at any depth; shows a cardinality chip
      (e.g. "1–3"); reflects `required` / `pattern` / `minLength` / `maxLength` /
      range onto the inputs ([FieldInput.vue](src/components/FieldInput.vue));
      surfaces `sh:message` coloured by severity; adds a language-tag input for
      `rdf:langString` / `rdf:HTML`.
- [x] **Create-&-link nested shape (U5):** a "Create & link nested shape" button
      on a `DetailsEditor` field mints a uniquely-named shape and sets `sh:node`
      in one undo step; the field card shows the link (`→ :ShapeIri`); dangling
      references are caught by the Phase 1 linter.

---

## Phase 4 — Expressiveness ✅

> **Verified:** `npm test` **142/142**; type-check clean; build ~393 KB gzip.
> Scope note: Phase 4 models the **common, form-relevant** cases of each
> construct and leans on the Phase 2 residual graph for the rest. For a
> form-design tool, arbitrary logical shapes and multi-step path expressions add
> heavy UI for little form value, so they remain preserved-but-not-modeled.


- [x] **Language-tagged labels (F8):** ✅ repeatable `sh:name`/`sh:description`
      with `@lang`. `Field` carries `nameLang`/`descriptionLang` for the primary
      label plus `nameI18n`/`descriptionI18n` translation lists
      ([types.ts](src/types.ts)); the parser collects every literal with its
      language tag and the generator emits one `sh:name`/`sh:description` per
      language ([shacl.ts](src/shacl.ts)). Authored in the Inspector via an
      inline language-tag input + a [`TranslationsEditor`](src/components/TranslationsEditor.vue).
      Backward-compatible: untagged labels stay untagged (existing output
      unchanged). Verified by round-trip tests.
      > Remaining within F8 (minor follow-up): schema-level `rdfs:label` /
      > `dct:description` language tags, and modeling `sh:languageIn`.
- [x] **Logical constraints (F6):** ✅ `sh:or` modeled as **alternative value
      types** — a list of type-only branches (`sh:nodeKind` / `sh:datatype` /
      `sh:class`), covering "literal **or** IRI" and "string **or** date". A
      branch with anything richer keeps the whole `sh:or` in the residual graph
      ([OrTypesEditor.vue](src/components/OrTypesEditor.vue)). `sh:xone`/`and`/
      `not` and qualified value shapes remain residual-preserved.
- [x] **Rich paths (F9):** ✅ `sh:inversePath` modeled (`Field.inversePath`;
      parsed from `[ sh:inversePath p ]`, generated back; Inspector checkbox; the
      field card shows `^path`). Sequence and alternative paths remain
      preserved verbatim via residual.

---

## Phase 5 — Structure & scale 🟡

> **Verified:** `npm test` **143/143**; type-check clean; build ~394 KB gzip.

- [x] **a11y add (U6):** palette widgets are now keyboard-focusable and
      add-on-click / Enter / Space, not drag-only — they append to the selected
      nested shape, the selected/last group, or a new one
      ([Palette.vue](src/components/Palette.vue), `addWidget` in
      [App.vue](src/App.vue)).
- [x] **Group reorder (U7, partial):** move-up / move-down controls on each group
      header reorder groups and renumber `sh:order`
      ([Canvas.vue](src/components/Canvas.vue)). *(Full drag-reorder of groups /
      nested shapes and dropping the manual field-order input remain.)*
- [x] **Visual-editor autocomplete (U9):** native `<datalist>` suggestions of
      common predicates on `sh:path` and common classes on `sh:class` /
      `sh:targetClass` (`VOCAB_TERMS` / `VOCAB_CLASSES` in
      [data.ts](src/data.ts)).
- [x] **Prefix hygiene (U10):** removing a prefix that's still referenced now
      asks for confirmation ([PrefixEditor.vue](src/components/PrefixEditor.vue)).
- [x] **Stable group IRIs (U11):** groups carry a minted, unique `iri` that
      stays fixed across renames; the generator emits it (falling back to a
      label-derived IRI for legacy data), killing the rename-breakage and
      collision class of bugs.
- [ ] **Shape navigator / outline (U8):** sidebar to jump between shapes and
      large field lists. *(Pending.)*
- [ ] **Peer top-level shapes (F4):** support many independent, mutually-
      referencing NodeShapes rather than "first shape is primary, rest are
      nested." **Deliberately deferred** — an XL model rework touching the whole
      app; the current model already supports multiple shapes (hierarchically),
      so the ROI doesn't justify destabilizing Phases 1–4 in one pass. Best as a
      dedicated effort — see the **F4 design** below.

---

## F4 — Peer top-level shapes (design + phasing)

**Problem.** Today the model has an *implicit primary shape* (the `Schema`
top-level `shapeIri`/`targetClass`/`schemaName`/`groups`) plus second-class
`nestedShapes` (flat, no groups, chosen by document order). Real FAIR/DCAT-AP
schemas are **graphs of equal, mutually-referencing shapes** (Catalog → Dataset
→ Distribution → DataService + Agent/Kind). The current model misrepresents
them and denies non-primary shapes groups.

**Target model** — unify into a `shapes[]` array, every shape first-class:

```ts
interface NodeShape { id; iri; targetClass; name; description; groups: Group[] }
interface ShapesDoc { prefixes: Prefix[]; shapes: NodeShape[]; residual?: string }
// Schema's schemaName/shapeIri/targetClass/groups/nestedShapes collapse into shapes[].
```

**Key decisions.** "Nested" dissolves — there are just shapes, cross-referenced
by `sh:node` (the FormPreview recursion already resolves by IRI, so it
generalizes for free). No "primary" in the data — which shape is shown is **UI
focus state**. Selection collapses 5 kinds → 3 (`shape`/`group`/`field`).
Residual stays document-level + per-shape-by-IRI. **U8 (navigator) falls out**
as the shape list.

**Phasing.**

- [x] **F4.1 — model + adapters + parse/generate wrappers + tests** ✅:
      purely additive `NodeShape`/`ShapesDoc` types, lossless
      `shapesFromLegacy`/`legacyFromShapes` adapters, and thin
      `parseToShapes`/`generateFromShapes` over the existing proven path. The
      live `Schema`, store, UI, and existing tests are untouched (the new code
      is tree-shaken out of the shipped bundle — `dist` byte-identical). Verified
      by [shapes.adapter.test.ts](src/__tests__/shapes.adapter.test.ts) (adapter
      identity + a 3-peer-shape round-trip). `npm test` **147/147**.
- [ ] **F4.2 — UI + store flip:** generalize the N3 parser to group fields on
      *every* shape; make `ShapesDoc` the store's source of truth (with a
      `migrate(old)` for drafts/examples); shape navigator; per-shape canvas;
      unified Inspector; `focusedShapeId`. The bulk of the cost. **L–XL.**
- [ ] **F4.3 — preview per-shape, polish, guide.** **M.**

**Recommendation.** Worth it for the FDP ecosystem (multi-shape packages are the
norm), phased. F4.1 is safe to land now; **gate F4.2** on confirming multi-shape
editing is a real user workflow, since that's where the cost and the core-UX
reshape concentrate.

---

## Phase 6 — Optional / opt-in 🟡

- [x] **JSON-LD export (U12, partial):** ✅ a hand-rolled RDF→JSON-LD serializer
      ([jsonld.ts](src/jsonld.ts)) — **no new dependency** — surfaced as an
      export-only entry in the SHACL Code syntax toggle (read-only; copy / Save
      As `.jsonld`). Builds a `@context` from the declared prefixes
      (`@vocab`/`@base` for the empty prefix), embeds single-reference blank
      nodes, collapses RDF lists (`sh:in`/`sh:or`) to `@list`, and renders
      language-tagged labels as `@value`/`@language`. Verified by
      [jsonld.test.ts](src/__tests__/jsonld.test.ts) (**152/152**; bundle
      ~395 KB gzip).
- [ ] **RDF/XML syntax** via `rdfxml-streaming-parser` — still gated on the
      bundle-size budget (heavier than N3.js); possibly lazy-loaded.
- [ ] **Validate sample data against the shape:** paste/load instance RDF and run
      a SHACL validation, showing the report — closes the FAIR authoring loop.

---

## Cross-cutting verification

- [ ] `npm test` green; new tests for each phase (notably Phase 2 round-trip &
      preservation).
- [ ] `npm run build` still produces a single self-contained `dist/index.html`;
      record bundle-size deltas (N3.js in Phase 2; deferred libs in Phase 6).
- [ ] Generated Turtle stays clean and human-readable; new schemas default to
      Turtle.
- [ ] Keyboard reachability for added affordances (undo, add-field, toggle).

> **Environment caveat (carried over):** in the sandbox `npm run dev` / `npm run
> build` may fail (esbuild can't spawn its service). Source edits are fine here;
> **building, bundle-size measurement, and screenshots require a real
> environment.**

---

# Contour Rebrand — Implementation Plan (archived — done)

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
