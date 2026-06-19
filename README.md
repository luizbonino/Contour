# Contour

**Visual schemas. Clean SHACL.**

Contour is a browser-based, drag-and-drop editor for building [SHACL](https://www.w3.org/TR/shacl/) NodeShapes with [DASH form widgets](https://datashapes.org/forms.html). Designed for the [FAIR Data Point](https://fairdatapoint.org/) ecosystem, but usable with any SHACL-aware platform.

**▶ Live app: <https://luizbonino.github.io/Contour/>**

> **New to the editor?** Data stewards should start with the
> **[Creating Metadata Schemas guide](docs/data-steward-guide.md)** — a
> screenshot-driven, step-by-step walkthrough of building a custom schema.

## Features

- **Visual canvas** — drag DASH widgets from the palette and drop them onto the canvas to build `sh:property` blocks without writing Turtle by hand.
- **Live Turtle generation** — the SHACL Turtle is regenerated on every change and shown in a syntax-highlighted preview pane.
- **Bidirectional editing** — switch to the Definition tab to edit the raw Turtle directly; changes are parsed and synced back to the visual canvas automatically.
- **Turtle autocomplete** — the Turtle editor offers context-aware completions for SHACL predicates, node kinds, XSD datatypes, DASH editors, and `@prefix` declarations.
- **Form preview** — renders a realistic HTML form from the current schema so you can verify the user experience before deploying.
- **File operations** — open, save, and save-as `.ttl` files using the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) (with a fallback for browsers that don't support it).
- **Groups and nested shapes** — supports `sh:PropertyGroup` for organising fields into sections and `sh:node` for embedding sub-forms.
- **Prefix management** — add, remove, and rename `@prefix` declarations from the Inspector panel.
- **Zero backend** — the editor is a fully client-side single-page application; no server required.

## Supported widgets

| Widget | DASH editor | Description |
|---|---|---|
| Text field | `dash:TextFieldEditor` | Single-line text (`xsd:string`) |
| Text area | `dash:TextAreaEditor` | Multi-line text |
| Rich text | `dash:RichTextEditor` | Formatted text with language tag (`rdf:HTML`) |
| URI | `dash:URIEditor` | IRI / link input |
| Auto-complete | `dash:AutoCompleteEditor` | Instance lookup by label |
| Instances select | `dash:InstancesSelectEditor` | Drop-down of instances |
| Details (nested) | `dash:DetailsEditor` | Embedded sub-form via `sh:node` |
| Enumeration | `dash:EnumSelectEditor` | Choice from a fixed `sh:in` list |
| Boolean | `dash:BooleanSelectEditor` | true / false select |
| Date picker | `dash:DatePickerEditor` | Calendar selector (`xsd:date`) |
| Date & time | `dash:DateTimePickerEditor` | Date with time (`xsd:dateTime`) |
| Number | `dash:NumberFieldEditor` | Numeric field (`xsd:integer`) |

## Tech stack

- [Vue 3](https://vuejs.org/) with Composition API and `<script setup>`
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) + [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) (produces a single self-contained HTML file)
- [Vitest](https://vitest.dev/) for unit tests

## Getting started

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Run tests
npm test

# Build for production (outputs a single HTML file in dist/)
npm run build
```

The production build is a single `index.html` file that can be served as a static asset or opened directly in a browser.

## Deployment

The build output is a **single self-contained `index.html`** file — all JavaScript and CSS are inlined. No web server or Node.js runtime is required at runtime.

### Option 1 — Download the release asset

Download `index.html` from the [latest release](https://github.com/luizbonino/Contour/releases/latest) and open it directly in a browser. No installation needed.

### Option 2 — Build from source

```bash
npm install
npm run build
# Output: dist/index.html
```

Open `dist/index.html` in any modern browser, or serve it from any static host.

### Option 3 — Static hosting (GitHub Pages, Netlify, Vercel, etc.)

Because the entire app lives in one file, any static host works with zero configuration — just serve `dist/index.html`.

This repository deploys to **GitHub Pages automatically**: the [`Deploy to GitHub Pages`](.github/workflows/deploy-pages.yml) workflow builds the app and publishes `dist/` on every push to `main` (Pages source = **GitHub Actions**). The live site is <https://luizbonino.github.io/Contour/>.

To set this up on a fork: in **Settings → Pages**, set the source to **GitHub Actions**, then push to `main`.

### Browser compatibility

The editor targets evergreen browsers. The **File System Access API** (used for Save / Save As) is supported in Chrome and Edge 86+. Firefox and Safari fall back to a download-prompt automatically.

## Project structure

```
src/
├── components/
│   ├── Canvas.vue        # Drag-and-drop field canvas
│   ├── Inspector.vue     # Property panel for the selected element
│   ├── Palette.vue       # Widget palette (drag source)
│   ├── FormPreview.vue   # Rendered form preview
│   └── ...               # Supporting components
├── composables/
│   ├── useSchema.ts      # Reactive schema store with immutable mutations
│   └── useDrag.ts        # Shared drag-and-drop state
├── shacl.ts              # SHACL Turtle parser and generator
├── data.ts               # Widget catalogue and seed schema
└── types.ts              # TypeScript type definitions
```

## License

MIT
