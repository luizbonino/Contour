// Lookup index for AutoComplete / Instances-select fields. Contour has no
// server-side instance store, so it searches local sources instead: records
// saved in Contour, imported vocabulary files, and a field's sh:in values.
// Items are matched by the field's sh:class (a type, or a known subclass of
// it) and by label / IRI text.
import type { Quad } from './rdf';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SUBCLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';

export type LookupSourceKind = 'record' | 'vocab' | 'in';

export interface LookupItem {
  iri: string;
  label: string;
  types: string[];
  source: string; // record's schema name, vocabulary file name, or 'sh:in'
  sourceKind: LookupSourceKind;
}

// Preferred label predicates, best first.
export const LABEL_PREDICATES = [
  'http://www.w3.org/2004/02/skos/core#prefLabel',
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://purl.org/dc/terms/title',
  'http://xmlns.com/foaf/0.1/name',
  'http://www.w3.org/2006/vcard/ns#fn',
  'https://schema.org/name',
  'http://schema.org/name',
  'http://purl.org/dc/elements/1.1/title',
];

// Well-known subclass links, so e.g. a foaf:Person record is offered for a
// field constrained to foaf:Agent. Vocabulary files can add more.
const FOAF = 'http://xmlns.com/foaf/0.1/';
const VCARD = 'http://www.w3.org/2006/vcard/ns#';
const DCAT = 'http://www.w3.org/ns/dcat#';
export const BUILTIN_SUBCLASSES: [string, string][] = [
  [FOAF + 'Person', FOAF + 'Agent'],
  [FOAF + 'Organization', FOAF + 'Agent'],
  [FOAF + 'Group', FOAF + 'Agent'],
  [VCARD + 'Individual', VCARD + 'Kind'],
  [VCARD + 'Organization', VCARD + 'Kind'],
  [VCARD + 'Group', VCARD + 'Kind'],
  [DCAT + 'Catalog', DCAT + 'Dataset'],
  [DCAT + 'Dataset', DCAT + 'Resource'],
  [DCAT + 'DataService', DCAT + 'Resource'],
];

/** rdfs:subClassOf pairs stated in a graph. */
export function subclassPairs(quads: Quad[]): [string, string][] {
  return quads
    .filter((q) => q.predicate.value === SUBCLASS_OF && q.object.termType === 'NamedNode')
    .map((q) => [q.subject.value, q.object.value]);
}

/** Pick the best label for a subject: preferred predicate, then language. */
function pickLabel(quads: Quad[], lang: string): string {
  for (const pred of LABEL_PREDICATES) {
    const lits = quads.filter((q) => q.predicate.value === pred && q.object.termType === 'Literal');
    if (!lits.length) continue;
    const langOf = (q: Quad) => ((q.object as unknown as { language?: string }).language || '').toLowerCase();
    const primary = lang.toLowerCase().split('-')[0];
    const best =
      lits.find((q) => langOf(q) === lang.toLowerCase()) ||
      lits.find((q) => langOf(q).split('-')[0] === primary) ||
      lits.find((q) => langOf(q) === 'en') ||
      lits.find((q) => langOf(q) === '') ||
      lits[0];
    return best.object.value;
  }
  return '';
}

/** Index every IRI subject that has a type or a label. */
export function indexQuads(
  quads: Quad[],
  source: string,
  sourceKind: LookupSourceKind,
  lang = 'en',
): LookupItem[] {
  const bySubject = new Map<string, Quad[]>();
  for (const q of quads) {
    if (q.subject.termType !== 'NamedNode') continue;
    const list = bySubject.get(q.subject.value) || [];
    list.push(q);
    bySubject.set(q.subject.value, list);
  }
  const items: LookupItem[] = [];
  for (const [iri, qs] of bySubject) {
    const types = qs.filter((q) => q.predicate.value === RDF_TYPE).map((q) => q.object.value);
    const label = pickLabel(qs, lang);
    if (!types.length && !label) continue;
    items.push({ iri, label, types, source, sourceKind });
  }
  return items;
}

/** Transitive closure: class → all of its superclasses (including itself). */
export function superclassMap(pairs: [string, string][]): Map<string, Set<string>> {
  const direct = new Map<string, string[]>();
  for (const [sub, sup] of pairs) {
    const list = direct.get(sub) || [];
    list.push(sup);
    direct.set(sub, list);
  }
  const closure = new Map<string, Set<string>>();
  const supersOf = (cls: string): Set<string> => {
    const cached = closure.get(cls);
    if (cached) return cached;
    const acc = new Set<string>([cls]);
    closure.set(cls, acc); // set before recursing: cycle-safe
    for (const sup of direct.get(cls) || []) for (const s of supersOf(sup)) acc.add(s);
    return acc;
  };
  for (const cls of direct.keys()) supersOf(cls);
  return closure;
}

export interface LookupQuery {
  classIri: string | null;
  text: string;
  limit?: number;
}

/** Items of the class (or a subclass), best text matches first, de-duplicated by IRI. */
export function searchLookup(
  items: LookupItem[],
  q: LookupQuery,
  supers: Map<string, Set<string>> = new Map(),
): LookupItem[] {
  const text = q.text.trim().toLowerCase();
  const isOfClass = (it: LookupItem) =>
    !q.classIri ||
    it.sourceKind === 'in' ||
    it.types.some((t) => t === q.classIri || supers.get(t)?.has(q.classIri!));

  const scored: { it: LookupItem; score: number }[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.iri) || !isOfClass(it)) continue;
    const label = it.label.toLowerCase();
    const iri = it.iri.toLowerCase();
    let score = 0;
    if (!text) score = 1;
    else if (label.startsWith(text)) score = 4;
    else if (label.split(/\s+/).some((w) => w.startsWith(text))) score = 3;
    else if (label.includes(text)) score = 2;
    else if (iri.includes(text)) score = 1;
    if (!score) continue;
    seen.add(it.iri);
    scored.push({ it, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.it.label || a.it.iri).localeCompare(b.it.label || b.it.iri));
  return scored.slice(0, q.limit ?? 50).map((s) => s.it);
}
