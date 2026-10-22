# @fairdatateam/record-core

The record engine shared by [Contour](https://contour.fairdatapoint.org/) and
[FDPlight](https://fdplight.fairdatapoint.org/): RDF parsing and
serialisation, lookups, and (in later steps) SHACL-driven records, the full
SHACL check and the form renderer.

The package ships TypeScript (and later `.vue`) sources. Consumers compile it
with Vite and `@vitejs/plugin-vue`. Import modules by path, for example

```ts
import { parseRdf } from '@fairdatateam/record-core/rdf';
```

Extraction plan: FDPlight `docs/shared-core.md`.
