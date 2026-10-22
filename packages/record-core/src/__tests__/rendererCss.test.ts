// @vitest-environment node
// Reads the components and the stylesheet from disk.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

describe('renderer.css', () => {
  it('styles every BEM class the renderer components use', () => {
    const css = readFileSync(src('renderer.css'), 'utf8');
    const used = new Set<string>();
    for (const f of readdirSync(src('components')).filter((n) => n.endsWith('.vue')))
      for (const m of readFileSync(src(`components/${f}`), 'utf8').matchAll(/\b((?:form-preview|lookup)__[a-z-]+)/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(10);
    const unstyled = [...used].filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    expect(unstyled).toEqual([]);
  });
});
