# @fairdatateam/record-core

The record engine shared by [Contour](https://contour.fairdatapoint.org/) and
[FDPlight](https://fdplight.fairdatapoint.org/): RDF parsing and
serialisation, lookups, SHACL-driven records, the full SHACL check
(shacl-engine) and the form renderer (Vue components).

Modules: `types`, `rdf`, `jsonld`, `jsonldParse`, `rdfxml`, `lookup`, `remote`,
`record`, `shacl`, `shaclCheck`, `forms`, `widgets`, `i18n`, `useFillContext`,
and `components/{PreviewField,FieldInput,LookupInput,Icon}.vue`.

- `forms.formSchema(schema, targetClasses)` builds one form from the peer
  NodeShapes an FDP serves for a type (`GET /{prefix}/spec`).
- The renderer translates through the `RECORD_I18N` injection key
  (`i18n.ts`), with English defaults.
- Its styles are in `renderer.css` (import once in the host app). Design
  tokens default to Contour's values; define them on `:root` to restyle.

The package ships TypeScript (and later `.vue`) sources. Consumers compile it
with Vite and `@vitejs/plugin-vue`. Import modules by path, for example

```ts
import { parseRdf } from '@fairdatateam/record-core/rdf';
```

Extraction plan: FDPlight `docs/shared-core.md`.

## Install

```sh
npm install @fairdatateam/record-core
```

## Releasing

Releases go to npm from GitHub Actions with trusted publishing
(`.github/workflows/publish-record-core.yml`), so no npm token is stored.

1. Bump `version` in `packages/record-core/package.json` in a PR and merge it.
2. Tag the merge commit `record-core-v{version}` and push the tag, e.g.
   `git tag record-core-v0.2.1 && git push origin record-core-v0.2.1`.
3. The workflow checks that the tag matches the version, runs the package's
   tests and publishes with a provenance attestation.

The app's own releases use `v*` tags and are unaffected.
