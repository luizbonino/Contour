// RDF engine wrapper around N3.js. Parses and serializes the RDF syntaxes the
// SHACL Code tab can toggle between; Turtle is the default. Higher layers
// (shacl.ts) project the parsed quads into Contour's editable Schema and keep
// everything they don't model in a residual graph so nothing is lost.
import N3 from 'n3';
import type { Prefix } from './types';
import { parseJsonLd } from './jsonldParse';
import { parseRdfXml } from './rdfxml';

const { Parser, Writer, Store, DataFactory } = N3;
export { Store, DataFactory };
export type { Quad } from 'n3';
import type { Quad } from 'n3';

export interface RdfSyntax {
  id: string;
  label: string;
  format: string; // N3 format string
  ext: string;    // file extension (no dot)
  hasPrefixes: boolean;
  editable?: boolean; // false → not editable in the SHACL Code textarea (default true)
  output?: boolean;   // false → import only, never offered as an output syntax (default true)
}

export const SYNTAXES: RdfSyntax[] = [
  { id: 'turtle', label: 'Turtle', format: 'text/turtle', ext: 'ttl', hasPrefixes: true },
  { id: 'ntriples', label: 'N-Triples', format: 'application/n-triples', ext: 'nt', hasPrefixes: false },
  { id: 'trig', label: 'TriG', format: 'application/trig', ext: 'trig', hasPrefixes: true },
  { id: 'n3', label: 'Notation3', format: 'text/n3', ext: 'n3', hasPrefixes: true },
  // Read on import, but not edited in the SHACL Code textarea.
  { id: 'jsonld', label: 'JSON-LD', format: 'application/ld+json', ext: 'jsonld', hasPrefixes: true, editable: false },
  // Import only (files you open / import); never written.
  { id: 'rdfxml', label: 'RDF/XML', format: 'application/rdf+xml', ext: 'rdf', hasPrefixes: true, editable: false, output: false },
];

/** Syntaxes Contour can write (the syntax menus). */
export const OUTPUT_SYNTAXES: RdfSyntax[] = SYNTAXES.filter((s) => s.output !== false);

/** File extensions accepted when opening / importing RDF. */
export const RDF_FILE_ACCEPT = '.ttl,.shacl,.nt,.trig,.n3,.jsonld,.json,.rdf,.owl,.xml';

export const SYNTAX_BY_ID: Record<string, RdfSyntax> = Object.fromEntries(
  SYNTAXES.map((s) => [s.id, s]),
);

export const DEFAULT_SYNTAX = 'turtle';

/** Pick a syntax id from a file name's extension, defaulting to Turtle. */
export function detectSyntax(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m ? m[1] : '';
  const found = SYNTAXES.find((s) => s.ext === ext);
  if (found) return found.id;
  if (ext === 'json') return 'jsonld';
  if (ext === 'owl' || ext === 'xml') return 'rdfxml';
  return DEFAULT_SYNTAX;
}

// Prefix declarations exist in Turtle/TriG/N3 (both @prefix and SPARQL PREFIX
// styles). N-Triples/N-Quads have none. N3's synchronous parser doesn't surface
// them, so scan the text directly.
function extractPrefixes(text: string): Prefix[] {
  const out: Prefix[] = [];
  const seen = new Set<string>();
  const push = (prefix: string, uri: string) => {
    if (seen.has(prefix)) return;
    seen.add(prefix);
    out.push({ prefix, uri });
  };
  const at = /@prefix\s+([\w-]*):\s*<([^>]*)>\s*\./g;
  const sparql = /(?:^|\s)PREFIX\s+([\w-]*):\s*<([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = at.exec(text)) !== null) push(m[1], m[2]);
  while ((m = sparql.exec(text)) !== null) push(m[1], m[2]);
  return out;
}

export interface RdfParseResult {
  quads: Quad[];
  prefixes: Prefix[];
  error: string | null;
  errorLine: number | null;
}

// Prefixes declared in a JSON-LD @context (string-valued terms ending in / or #).
function jsonLdPrefixes(text: string): Prefix[] {
  try {
    const doc = JSON.parse(text);
    const ctxs = [doc?.['@context']].flat().filter((c) => c && typeof c === 'object');
    const out: Prefix[] = [];
    for (const c of ctxs) {
      for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
        if (typeof v === 'string' && /[/#]$/.test(v)) out.push({ prefix: k === '@vocab' ? '' : k, uri: v });
      }
    }
    return out.filter((p) => !p.prefix.startsWith('@'));
  } catch {
    return [];
  }
}

// Namespace declarations (xmlns:p="…") of an RDF/XML document.
function xmlPrefixes(text: string): Prefix[] {
  const out: Prefix[] = [];
  const re = /xmlns:([\w.-]+)\s*=\s*(["'])(.*?)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) if (m[1] !== 'rdf' || m[3]) out.push({ prefix: m[1], uri: m[3] });
  return out;
}

/** Parse RDF text in the given syntax into quads + declared prefixes. */
export function parseRdf(text: string, syntaxId: string): RdfParseResult {
  const syntax = SYNTAX_BY_ID[syntaxId] || SYNTAX_BY_ID[DEFAULT_SYNTAX];
  try {
    if (syntax.id === 'jsonld') return { quads: parseJsonLd(text), prefixes: jsonLdPrefixes(text), error: null, errorLine: null };
    if (syntax.id === 'rdfxml') return { quads: parseRdfXml(text), prefixes: xmlPrefixes(text), error: null, errorLine: null };
    const parser = new Parser({ format: syntax.format });
    const quads = parser.parse(text);
    return { quads, prefixes: syntax.hasPrefixes ? extractPrefixes(text) : [], error: null, errorLine: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lm = msg.match(/line (\d+)/i);
    return { quads: [], prefixes: [], error: msg, errorLine: lm ? parseInt(lm[1], 10) : null };
  }
}

/** Serialize quads to the given syntax, declaring the supplied prefixes. */
export function serializeQuads(quads: Quad[], prefixes: Prefix[], syntaxId: string): string {
  const syntax = SYNTAX_BY_ID[syntaxId] || SYNTAX_BY_ID[DEFAULT_SYNTAX];
  const prefixMap: Record<string, string> = {};
  if (syntax.hasPrefixes) for (const p of prefixes) prefixMap[p.prefix] = p.uri;
  const writer = new Writer({ format: syntax.format, prefixes: prefixMap });
  writer.addQuads(quads);
  let out = '';
  writer.end((err: Error | null, result: string) => {
    if (err) throw err;
    out = result;
  });
  return out;
}

/** Compact a full IRI to a CURIE using the declared prefixes (longest match), or `<iri>`. */
export function shorten(iri: string, prefixes: Prefix[]): string {
  let best: Prefix | null = null;
  for (const p of prefixes) {
    if (p.uri && iri.startsWith(p.uri) && (!best || p.uri.length > best.uri.length)) best = p;
  }
  if (best) return `${best.prefix}:${iri.slice(best.uri.length)}`;
  return `<${iri}>`;
}
