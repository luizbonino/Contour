// Metadata records — the "light FDP" side of Contour. A record is the data a
// user enters into the form generated from the schema; this module turns it
// into RDF (any supported syntax), checks it against the constraints Contour
// models, and maps existing RDF records back into the form.
//
// Values are keyed by property path (`fieldKey`), not field id: ids are
// re-minted whenever the SHACL code is re-parsed, paths are stable.
import { DataFactory, parseRdf, serializeQuads, SYNTAX_BY_ID, DEFAULT_SYNTAX } from './rdf';
import type { Quad } from './rdf';
import { serializeJsonLd } from './jsonld';
import type { Field, NestedShape, Prefix, Schema } from './types';

const { namedNode, blankNode, literal, quad } = DataFactory;
type Term = Quad['object'];

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_TYPE = RDF + 'type';

// Always resolvable, even when the schema doesn't declare them (datatypes are
// written as xsd:… / rdf:… CURIEs throughout the model).
const WELL_KNOWN: Prefix[] = [
  { prefix: 'rdf', uri: RDF },
  { prefix: 'rdfs', uri: 'http://www.w3.org/2000/01/rdf-schema#' },
  { prefix: 'xsd', uri: XSD },
  { prefix: 'dct', uri: 'http://purl.org/dc/terms/' },
  { prefix: 'dcat', uri: 'http://www.w3.org/ns/dcat#' },
  { prefix: 'foaf', uri: 'http://xmlns.com/foaf/0.1/' },
  { prefix: 'skos', uri: 'http://www.w3.org/2004/02/skos/core#' },
  { prefix: 'vcard', uri: 'http://www.w3.org/2006/vcard/ns#' },
];

// Title-like predicates: drive the subject-IRI slug and the record's label.
export const TITLE_PREDICATES = [
  'http://purl.org/dc/terms/title',
  'http://www.w3.org/2004/02/skos/core#prefLabel',
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://xmlns.com/foaf/0.1/name',
  'http://www.w3.org/2006/vcard/ns#fn',
  'https://schema.org/name',
  'http://schema.org/name',
];

export const DEFAULT_BASE_IRI = 'https://example.org/';
const MAX_DEPTH = 6; // guards cyclic sh:node references

// ── Model ────────────────────────────────────────────────────────────────────

/** One entered value. `node` holds the nested record of a DetailsEditor field. */
export interface RecordValue {
  value: string;
  lang?: string;
  node?: RecordNode;
}

/** Values of one (nested) resource, keyed by `fieldKey`. */
export type RecordNode = Record<string, RecordValue[]>;

export interface MetadataRecord {
  id: string;
  shapeIri: string;
  schemaName: string;
  targetClass: string; // expanded IRI
  subject: string;     // absolute IRI
  subjectAuto: boolean; // still following the title slug (not hand-edited)
  values: RecordNode;
  ntriples?: string;   // cached generated triples (lookups, export of other schemas)
  label?: string;
  updatedAt: number;
}

export const fieldKey = (f: Field): string => (f.inversePath ? '^' : '') + f.path;

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

/** The primary shape's fields in form order (group order, then field order). */
export function shapeFields(schema: Schema): Field[] {
  return schema.groups
    .slice()
    .sort(byOrder)
    .flatMap((g) => g.fields.slice().sort(byOrder))
    .filter((f) => f.path);
}

export function nestedShapeOf(schema: Schema, field: Field): NestedShape | null {
  if (field.widgetId !== 'DetailsEditor' || !field.node) return null;
  return (schema.nestedShapes || []).find((ns) => ns.iri === field.node) ?? null;
}

export function nestedFieldsOf(ns: NestedShape): Field[] {
  return ns.fields.slice().sort(byOrder).filter((f) => f.path);
}

// ── Terms ────────────────────────────────────────────────────────────────────

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>"{}|\\^`]*$/;

export function isAbsoluteIri(s: string): boolean {
  return ABSOLUTE_IRI.test(s);
}

function findPrefix(prefixes: Prefix[], pfx: string): Prefix | undefined {
  return prefixes.find((p) => p.prefix === pfx) ?? WELL_KNOWN.find((p) => p.prefix === pfx);
}

/** Expand `<iri>`, a CURIE (schema prefixes, then well-known ones) or an absolute IRI. */
export function expandTerm(term: string, prefixes: Prefix[]): string | null {
  const t = term.trim();
  if (!t) return null;
  if (t.startsWith('<') && t.endsWith('>')) {
    const inner = t.slice(1, -1);
    return isAbsoluteIri(inner) ? inner : null;
  }
  const c = t.indexOf(':');
  if (c >= 0 && !t.slice(c + 1).startsWith('//')) {
    const p = findPrefix(prefixes, t.slice(0, c));
    if (p) {
      const iri = p.uri + t.slice(c + 1);
      return isAbsoluteIri(iri) ? iri : null;
    }
  }
  return isAbsoluteIri(t) ? t : null;
}

/** Does free text look like an IRI (for fields that allow either IRI or literal)? */
function looksLikeIri(value: string, prefixes: Prefix[]): boolean {
  const v = value.trim();
  if (v.startsWith('<') && v.endsWith('>')) return true;
  if (/^(https?|ftp|urn|mailto|doi|file):\S+$/i.test(v)) return true;
  const c = v.indexOf(':');
  return c > 0 && !/\s/.test(v) && prefixes.some((p) => p.prefix === v.slice(0, c));
}

export function localName(iri: string): string {
  const m = iri.match(/[#/:]([^#/:]+)$/);
  return m ? m[1] : iri;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

export function shortId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

/** `base` + lower(localName(targetClass)) + "/" + slug. */
export function mintSubject(base: string, targetClass: string, slug: string): string {
  let b = (base || DEFAULT_BASE_IRI).trim();
  if (!/[/#]$/.test(b)) b += '/';
  const cls = targetClass ? localName(targetClass).toLowerCase() : 'record';
  return `${b}${slugify(cls) || 'record'}/${slug || shortId()}`;
}

/** Key of the first title-like field, if the shape has one. */
export function titleFieldKey(schema: Schema): string | null {
  const fields = shapeFields(schema);
  for (const pred of TITLE_PREDICATES) {
    const f = fields.find((ff) => !ff.inversePath && expandTerm(ff.path, schema.prefixes) === pred);
    if (f) return fieldKey(f);
  }
  return null;
}

/** First non-empty value of the title-like field. */
export function recordTitle(schema: Schema, values: RecordNode): string {
  const key = titleFieldKey(schema);
  if (!key) return '';
  return (values[key] || []).map((v) => v.value.trim()).find(Boolean) ?? '';
}

// ── Normalization ───────────────────────────────────────────────────────────

function newEntry(schema: Schema, field: Field, depth: number): RecordValue {
  const e: RecordValue = { value: field.defaultValue || '', lang: '' };
  const ns = nestedShapeOf(schema, field);
  if (ns && depth < MAX_DEPTH) e.node = normalizeNode(schema, nestedFieldsOf(ns), {}, depth + 1);
  return e;
}

/** Seed each field with its minimum number of (≥1) entries, recursively. Mutates `node`. */
export function normalizeNode(schema: Schema, fields: Field[], node: RecordNode, depth = 0): RecordNode {
  for (const f of fields) {
    const key = fieldKey(f);
    const list = node[key] || (node[key] = []);
    const min = Math.max(1, f.minCount || 0);
    const max = f.maxCount == null ? Infinity : Math.max(1, f.maxCount);
    while (list.length < Math.min(min, max)) list.push(newEntry(schema, f, depth));
    const ns = nestedShapeOf(schema, f);
    if (ns && depth < MAX_DEPTH) {
      for (const e of list) e.node = normalizeNode(schema, nestedFieldsOf(ns), e.node || {}, depth + 1);
    }
  }
  return node;
}

export function normalizeRecord(schema: Schema, values: RecordNode): RecordNode {
  return normalizeNode(schema, shapeFields(schema), values);
}

export function newEntryFor(schema: Schema, field: Field): RecordValue {
  return newEntry(schema, field, 0);
}

function nodeHasContent(node: RecordNode | undefined): boolean {
  if (!node) return false;
  return Object.values(node).some((list) => list.some(entryHasContent));
}

function entryHasContent(e: RecordValue): boolean {
  return !!e.value.trim() || nodeHasContent(e.node);
}

export function recordHasContent(values: RecordNode): boolean {
  return nodeHasContent(values);
}

// ── Value interpretation ─────────────────────────────────────────────────────

const IRI_WIDGETS = new Set(['URIEditor', 'AutoCompleteEditor', 'InstancesSelectEditor']);
const INTEGER_TYPES = new Set(
  ['integer', 'int', 'long', 'short', 'byte', 'nonNegativeInteger', 'positiveInteger',
    'negativeInteger', 'nonPositiveInteger', 'unsignedInt', 'unsignedLong', 'unsignedShort', 'unsignedByte']
    .map((t) => XSD + t),
);
const NUMERIC_TYPES = new Set([...INTEGER_TYPES, XSD + 'decimal', XSD + 'double', XSD + 'float']);

type Interpreted =
  | { kind: 'iri'; iri: string | null }
  | { kind: 'literal'; lexical: string; datatype: string | null; lang: string }
  | { kind: 'node' };

/** Normalize the lexical form the widgets produce (e.g. seconds on dateTime). */
function lexicalFor(datatype: string | null, value: string): string {
  const v = value.trim();
  if (datatype === XSD + 'dateTime' && /T\d{2}:\d{2}$/.test(v)) return v + ':00';
  return v;
}

function expandedDatatype(field: Field, prefixes: Prefix[]): string | null {
  if (field.widgetId === 'DateTimePickerEditor' && !field.datatype) return XSD + 'dateTime';
  if (field.widgetId === 'DatePickerEditor' && !field.datatype) return XSD + 'date';
  if (field.widgetId === 'BooleanSelectEditor' && !field.datatype) return XSD + 'boolean';
  return field.datatype ? expandTerm(field.datatype, prefixes) : null;
}

function interpret(field: Field, e: RecordValue, prefixes: Prefix[]): Interpreted {
  if (field.widgetId === 'DetailsEditor') {
    return e.value.trim() ? { kind: 'iri', iri: expandTerm(e.value, prefixes) } : { kind: 'node' };
  }
  const v = e.value.trim();
  let asIri = false;
  if (IRI_WIDGETS.has(field.widgetId)) asIri = true;
  else if (field.widgetId === 'EnumSelectEditor' && field.inValues?.length) {
    asIri = field.inValues.find((iv) => iv.value === v)?.kind === 'iri';
  } else if (field.nodeKind === 'sh:IRI' || field.nodeKind === 'sh:BlankNodeOrIRI') asIri = true;
  else if (field.nodeKind === 'sh:IRIOrLiteral' || field.orTypes?.some((o) => o.nodeKind === 'sh:IRI' || o.class)) {
    asIri = looksLikeIri(v, prefixes);
  }
  if (asIri) return { kind: 'iri', iri: expandTerm(v, prefixes) };

  let datatype = expandedDatatype(field, prefixes);
  if (field.orTypes?.length) {
    // Pick the first alternative datatype the value fits, most specific first.
    const dts = field.orTypes
      .map((o) => (o.datatype ? expandTerm(o.datatype, prefixes) : null))
      .filter((d): d is string => !!d)
      .sort((a, b) => Number(a === XSD + 'string') - Number(b === XSD + 'string'));
    datatype = dts.find((d) => lexicalOk(d, lexicalFor(d, v))) ?? dts[0] ?? datatype;
  }
  return { kind: 'literal', lexical: lexicalFor(datatype, v), datatype, lang: (e.lang || '').trim() };
}

function literalTerm(lex: string, datatype: string | null, lang: string): Term {
  if (lang && (!datatype || datatype === RDF + 'langString' || datatype === XSD + 'string')) {
    return literal(lex, lang);
  }
  if (!datatype || datatype === XSD + 'string' || datatype === RDF + 'langString') return literal(lex);
  return literal(lex, namedNode(datatype));
}

// ── RDF generation ───────────────────────────────────────────────────────────

/** Where each generated RDF node sits in the form (to map SHACL results back). */
export type NodeLocations = Map<string, { loc: string; fields: Field[] }>;

function emitNode(
  schema: Schema,
  fields: Field[],
  node: RecordNode,
  subject: Quad['subject'],
  out: Quad[],
  depth: number,
  loc = '',
  nodes?: NodeLocations,
): void {
  const prefixes = schema.prefixes;
  nodes?.set(subject.id, { loc, fields });
  for (const f of fields) {
    const pred = expandTerm(f.path, prefixes);
    if (!pred) continue;
    const p = namedNode(pred);
    const fieldLoc = loc ? `${loc}/${fieldKey(f)}` : fieldKey(f);
    for (const [i, e] of (node[fieldKey(f)] || []).entries()) {
      if (!entryHasContent(e)) continue;
      const it = interpret(f, e, prefixes);
      let obj: Term | null = null;
      if (it.kind === 'iri') obj = it.iri ? namedNode(it.iri) : null;
      else if (it.kind === 'literal') obj = literalTerm(it.lexical, it.datatype, it.lang);
      else {
        const ns = nestedShapeOf(schema, f);
        if (!ns || !e.node || depth >= MAX_DEPTH) continue;
        const b = blankNode();
        const cls = ns.targetClass ? expandTerm(ns.targetClass, prefixes) : null;
        if (cls) out.push(quad(b, namedNode(RDF_TYPE), namedNode(cls)));
        emitNode(schema, nestedFieldsOf(ns), e.node, b, out, depth + 1, `${fieldLoc}/${i}`, nodes);
        obj = b;
      }
      if (!obj) continue;
      if (f.inversePath) {
        if (obj.termType === 'Literal') continue; // a literal can't be a subject
        out.push(quad(obj as Quad['subject'], p, subject as Term));
      } else {
        out.push(quad(subject, p, obj));
      }
      // A nested IRI value still carries its sub-form's data.
      if (it.kind === 'iri' && obj.termType === 'NamedNode' && f.widgetId === 'DetailsEditor') {
        const ns = nestedShapeOf(schema, f);
        if (ns && e.node && depth < MAX_DEPTH) emitNode(schema, nestedFieldsOf(ns), e.node, obj, out, depth + 1, `${fieldLoc}/${i}`, nodes);
      }
    }
  }
}

/** The record as RDF quads (subject typed with the schema's target class). */
export function recordToQuads(schema: Schema, subjectIri: string, values: RecordNode, nodes?: NodeLocations): Quad[] {
  const out: Quad[] = [];
  const s = namedNode(subjectIri);
  const cls = schema.targetClass ? expandTerm(schema.targetClass, schema.prefixes) : null;
  if (cls) out.push(quad(s, namedNode(RDF_TYPE), namedNode(cls)));
  emitNode(schema, shapeFields(schema), values, s, out, 0, '', nodes);
  return out;
}

/** Only the prefixes whose namespace some IRI in `quads` actually uses. */
export function usedPrefixes(quads: Quad[], prefixes: Prefix[]): Prefix[] {
  const candidates = [...prefixes, ...WELL_KNOWN.filter((w) => !prefixes.some((p) => p.prefix === w.prefix))];
  const used = new Set<Prefix>();
  const visit = (iri: string) => {
    let best: Prefix | null = null;
    for (const p of candidates) {
      if (p.uri && iri.startsWith(p.uri) && (!best || p.uri.length > best.uri.length)) best = p;
    }
    if (best) used.add(best);
  };
  for (const q of quads) {
    for (const t of [q.subject, q.object]) if (t.termType === 'NamedNode') visit(t.value);
    if (q.predicate.value !== RDF_TYPE) visit(q.predicate.value); // rdf:type prints as `a`
    if (q.object.termType === 'Literal') {
      const dt = (q.object as unknown as { datatype?: { value: string } }).datatype?.value;
      if (dt && dt !== XSD + 'string' && dt !== RDF + 'langString') visit(dt);
    }
  }
  return candidates.filter((p) => used.has(p));
}

// ── Clean Turtle printer ────────────────────────────────────────────────────
// Records are tree-shaped, so blank nodes referenced exactly once are printed
// inline as `[ … ]`, predicates are grouped per subject and objects shared per
// predicate — output reads like hand-written Turtle. Valid TriG and N3 too.

const PN_LOCAL = /^([A-Za-z0-9_]|[^\x00-\x7F])(([\w.-]|[^\x00-\x7F])*([\w-]|[^\x00-\x7F]))?$/;

function escapeLiteral(v: string): string {
  return v.replace(/[\\"\n\r\t]/g, (c) => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' })[c]!);
}

function turtle(quads: Quad[], prefixes: Prefix[]): string {
  const iri = (value: string): string => {
    let best: Prefix | null = null;
    for (const p of prefixes) {
      if (p.uri && value.startsWith(p.uri) && (!best || p.uri.length > best.uri.length)) best = p;
    }
    if (best) {
      const local = value.slice(best.uri.length);
      if (local === '' || PN_LOCAL.test(local)) return `${best.prefix}:${local}`;
    }
    return `<${value.replace(/[>\\]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))}>`;
  };
  const lit = (t: Term): string => {
    const l = t as unknown as { value: string; language?: string; datatype?: { value: string } };
    const body = `"${escapeLiteral(l.value)}"`;
    if (l.language) return `${body}@${l.language}`;
    const dt = l.datatype?.value;
    if (!dt || dt === XSD + 'string') return body;
    if (dt === XSD + 'integer' && /^[+-]?\d+$/.test(l.value)) return l.value;
    if (dt === XSD + 'boolean' && /^(true|false)$/.test(l.value)) return l.value;
    return `${body}^^${iri(dt)}`;
  };

  const bySubject = new Map<string, Quad[]>();
  const refs = new Map<string, number>();
  for (const q of quads) {
    const list = bySubject.get(q.subject.id) || [];
    list.push(q);
    bySubject.set(q.subject.id, list);
    if (q.object.termType === 'BlankNode') refs.set(q.object.id, (refs.get(q.object.id) || 0) + 1);
  }
  const inlinable = (t: Term) => t.termType === 'BlankNode' && refs.get(t.id) === 1;
  const printed = new Set<string>();

  const term = (t: Term, indent: string, path: Set<string>): string => {
    if (t.termType === 'NamedNode') return iri(t.value);
    if (t.termType === 'Literal') return lit(t);
    if (inlinable(t) && !path.has(t.id)) {
      printed.add(t.id);
      const qs = bySubject.get(t.id) || [];
      if (!qs.length) return '[]';
      const inner = indent + '    ';
      return `[\n${inner}${body(qs, inner, new Set(path).add(t.id))}\n${indent}]`;
    }
    return `_:${t.value.replace(/[^\w-]/g, '_')}`;
  };

  const body = (qs: Quad[], indent: string, path: Set<string>): string => {
    const byPred = new Map<string, Quad[]>();
    for (const q of qs) {
      const list = byPred.get(q.predicate.value) || [];
      list.push(q);
      byPred.set(q.predicate.value, list);
    }
    const lines: string[] = [];
    for (const [pred, pqs] of byPred) {
      const p = pred === RDF_TYPE ? 'a' : iri(pred);
      lines.push(`${p} ${pqs.map((q) => term(q.object as Term, indent, path)).join(', ')}`);
    }
    return lines.join(` ;\n${indent}`);
  };

  const blocks: string[] = [];
  const emit = (id: string, qs: Quad[]) => {
    printed.add(id);
    blocks.push(`${term(qs[0].subject as Term, '', new Set())} ${body(qs, '    ', new Set([id]))} .`);
  };
  // Roots: named or multiply-referenced subjects; inlinable blanks print within
  // their parent. Leftover blanks (e.g. in a cycle) are written as roots.
  for (const [id, qs] of bySubject) if (!inlinable(qs[0].subject as Term)) emit(id, qs);
  for (const [id, qs] of bySubject) if (!printed.has(id)) emit(id, qs);

  const head = prefixes.map((p) => `@prefix ${p.prefix}: <${p.uri}> .`).join('\n');
  return (head ? head + '\n\n' : '') + blocks.join('\n\n') + '\n';
}

/** Serialize quads in any supported syntax, declaring only the prefixes used. */
export function serializeGraph(quads: Quad[], prefixes: Prefix[], syntaxId: string = DEFAULT_SYNTAX): string {
  const syntax = SYNTAX_BY_ID[syntaxId] || SYNTAX_BY_ID[DEFAULT_SYNTAX];
  const used = usedPrefixes(quads, prefixes);
  if (syntax.id === 'jsonld') return serializeJsonLd(quads, used);
  if (!syntax.hasPrefixes) return serializeQuads(quads, [], syntax.id); // N-Triples: no inline [ ]
  return turtle(quads, used);
}

export function serializeRecord(
  schema: Schema,
  subjectIri: string,
  values: RecordNode,
  syntaxId: string = DEFAULT_SYNTAX,
): string {
  return serializeGraph(recordToQuads(schema, subjectIri, values), schema.prefixes, syntaxId);
}

// ── Validation ───────────────────────────────────────────────────────────────

export type RecordIssueSeverity = 'error' | 'warning' | 'info';

export interface RecordIssue {
  /** Field location: `key`, or `parentKey/index/key` inside sub-forms. `''` = subject. */
  loc: string;
  /** Value index within the field; undefined for field-level issues. */
  index?: number;
  severity: RecordIssueSeverity;
  /** Message code, translated by the UI (`record.issue.<code>`). */
  code: string;
  params?: Record<string, string | number>;
  /** The field's sh:message, when it declares one (shown instead of the generic text). */
  message?: string;
  fieldName: string;
}

const DATE_RE = /^-?\d{4,}-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/;
const DATETIME_RE = /^-?\d{4,}-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const LANG_RE = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;

function validDate(m: RegExpMatchArray | null): boolean {
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Is `lex` a valid lexical form of `datatype`? Unknown datatypes pass. */
export function lexicalOk(datatype: string | null, lex: string): boolean {
  if (!datatype) return true;
  if (INTEGER_TYPES.has(datatype)) {
    if (!/^[+-]?\d+$/.test(lex)) return false;
    const n = Number(lex);
    if (datatype === XSD + 'nonNegativeInteger' || datatype.startsWith(XSD + 'unsigned')) return n >= 0;
    if (datatype === XSD + 'positiveInteger') return n > 0;
    if (datatype === XSD + 'negativeInteger') return n < 0;
    if (datatype === XSD + 'nonPositiveInteger') return n <= 0;
    return true;
  }
  switch (datatype) {
    case XSD + 'decimal':
      return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(lex);
    case XSD + 'double':
    case XSD + 'float':
      return /^([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|[+-]?INF|NaN)$/.test(lex);
    case XSD + 'boolean':
      return /^(true|false|1|0)$/.test(lex);
    case XSD + 'date':
      return validDate(lex.match(DATE_RE));
    case XSD + 'dateTime':
      return validDate(lex.match(DATETIME_RE));
    case XSD + 'time':
      return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(lex);
    case XSD + 'gYear':
      return /^-?\d{4,}(Z|[+-]\d{2}:\d{2})?$/.test(lex);
    case XSD + 'anyURI':
      return isAbsoluteIri(lex);
    default:
      return true;
  }
}

function compareBound(value: string, bound: string, numeric: boolean): number | null {
  if (numeric) {
    const a = Number(value);
    const b = Number(bound);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return a - b;
  }
  return value < bound ? -1 : value > bound ? 1 : 0;
}

function severityOf(f: Field): RecordIssueSeverity {
  if (f.severity === 'sh:Warning') return 'warning';
  if (f.severity === 'sh:Info') return 'info';
  return 'error';
}

function displayName(f: Field): string {
  if (f.name) return f.name;
  return localName(f.path.replace(/[<>]/g, '')) || f.path;
}

function validateNode(
  schema: Schema,
  fields: Field[],
  node: RecordNode,
  base: string,
  issues: RecordIssue[],
  depth: number,
): void {
  const prefixes = schema.prefixes;
  for (const f of fields) {
    const key = fieldKey(f);
    const loc = base ? `${base}/${key}` : key;
    const entries = node[key] || [];
    const push = (code: string, index?: number, params?: RecordIssue['params']) =>
      issues.push({
        loc, index, code, params,
        severity: severityOf(f),
        message: f.message || undefined,
        fieldName: displayName(f),
      });

    const filled = entries.filter(entryHasContent).length;
    if (f.minCount && filled < f.minCount) push('minCount', undefined, { min: f.minCount });
    if (f.maxCount != null && filled > f.maxCount) push('maxCount', undefined, { max: f.maxCount });

    entries.forEach((e, i) => {
      if (!entryHasContent(e)) return;
      const it = interpret(f, e, prefixes);
      const v = e.value.trim();

      if (it.kind === 'node') {
        const ns = nestedShapeOf(schema, f);
        if (ns && e.node && depth < MAX_DEPTH) {
          validateNode(schema, nestedFieldsOf(ns), e.node, `${loc}/${i}`, issues, depth + 1);
        }
        return;
      }
      if (it.kind === 'iri') {
        if (!it.iri) {
          push('iri', i, { value: v });
          return;
        }
      } else {
        if (f.inversePath) push('inverseLiteral', i);
        const badLexical = () => push('datatype', i, { datatype: shortDatatype(it.datatype, prefixes) });
        if (f.orTypes?.length) {
          // A literal must fit one literal alternative (an untyped sh:Literal accepts any).
          const lits = f.orTypes.filter((o) => o.datatype || (o.nodeKind || '').includes('Literal'));
          if (!lits.length) push('orTypes', i);
          else if (!lits.some((o) => !o.datatype) && !lexicalOk(it.datatype, it.lexical)) badLexical();
        } else if (!lexicalOk(it.datatype, it.lexical)) badLexical();
        if (it.datatype === RDF + 'langString' && !it.lang) push('langRequired', i);
        if (it.lang && !LANG_RE.test(it.lang)) push('langInvalid', i, { lang: it.lang });

        const numeric = !!it.datatype && NUMERIC_TYPES.has(it.datatype);
        const bound = (b: string | undefined, code: string, bad: (c: number) => boolean) => {
          if (!b) return;
          const c = compareBound(it.lexical, b.replace(/^"|"(\^\^.*)?$/g, ''), numeric);
          if (c !== null && bad(c)) push(code, i, { bound: b });
        };
        bound(f.minInclusive, 'minInclusive', (c) => c < 0);
        bound(f.maxInclusive, 'maxInclusive', (c) => c > 0);
        bound(f.minExclusive, 'minExclusive', (c) => c <= 0);
        bound(f.maxExclusive, 'maxExclusive', (c) => c >= 0);
      }

      if (f.minLength != null && v.length < f.minLength) push('minLength', i, { min: f.minLength });
      if (f.maxLength != null && v.length > f.maxLength) push('maxLength', i, { max: f.maxLength });
      if (f.pattern) {
        try {
          if (!new RegExp(f.pattern).test(v)) push('pattern', i, { pattern: f.pattern });
        } catch {
          /* invalid regex in the schema — the schema linter's concern */
        }
      }
      if (f.inValues?.length) {
        const ok = f.inValues.some((iv) =>
          iv.kind === 'iri'
            ? it.kind === 'iri' && expandTerm(iv.value, prefixes) === it.iri
            : iv.value === v,
        );
        if (!ok) push('in', i, { value: v });
      }
    });
  }
}

function shortDatatype(dt: string | null, prefixes: Prefix[]): string {
  if (!dt) return 'xsd:string';
  for (const p of [...prefixes, ...WELL_KNOWN]) {
    if (p.prefix && dt.startsWith(p.uri)) return `${p.prefix}:${dt.slice(p.uri.length)}`;
  }
  return dt;
}

/**
 * Check a record against the constraints Contour models. `otherSubjects` are
 * the subject IRIs of the other records in the library (duplicate check).
 */
export function validateRecord(
  schema: Schema,
  subjectIri: string,
  values: RecordNode,
  otherSubjects: string[] = [],
): RecordIssue[] {
  const issues: RecordIssue[] = [];
  const subj = subjectIri.trim();
  if (!subj || !isAbsoluteIri(subj)) {
    issues.push({ loc: '', severity: 'error', code: 'subjectInvalid', fieldName: '' });
  } else if (otherSubjects.includes(subj)) {
    issues.push({ loc: '', severity: 'warning', code: 'subjectDuplicate', fieldName: '' });
  }
  validateNode(schema, shapeFields(schema), values, '', issues, 0);
  return issues;
}

// ── Import ───────────────────────────────────────────────────────────────────

export interface ImportedRecord {
  subject: string;
  subjectIsBlank: boolean;
  values: RecordNode;
}

export interface RecordImportResult {
  records: ImportedRecord[];
  /** Triples in the file that the form has no place for. */
  unmapped: number;
  error: string | null;
}

function shortenForEnum(iri: string, field: Field, prefixes: Prefix[]): string {
  const hit = field.inValues?.find((iv) => iv.kind === 'iri' && expandTerm(iv.value, prefixes) === iri);
  return hit ? hit.value : iri;
}

/** Map RDF text back to records: one per subject typed with the target class. */
export function importRecords(text: string, syntaxId: string, schema: Schema): RecordImportResult {
  const parsed = parseRdf(text, syntaxId);
  if (parsed.error) return { records: [], unmapped: 0, error: parsed.error };
  const quads = parsed.quads;
  const prefixes = schema.prefixes;
  const cls = schema.targetClass ? expandTerm(schema.targetClass, prefixes) : null;
  if (!cls) return { records: [], unmapped: quads.length, error: 'noTargetClass' };

  const consumed = new Set<Quad>();
  const out = (s: Term) => quads.filter((q) => q.subject.equals(s));
  const inc = (o: Term) => quads.filter((q) => q.object.equals(o));

  const readNode = (subject: Term, fields: Field[], depth: number): RecordNode => {
    const node: RecordNode = {};
    for (const f of fields) {
      const pred = expandTerm(f.path, prefixes);
      if (!pred) continue;
      const matches = (f.inversePath ? inc(subject) : out(subject)).filter((q) => q.predicate.value === pred);
      const list: RecordValue[] = [];
      for (const q of matches) {
        const v = (f.inversePath ? q.subject : q.object) as Term;
        const ns = nestedShapeOf(schema, f);
        if (ns && v.termType !== 'Literal' && depth < MAX_DEPTH) {
          consumed.add(q);
          const nsCls = ns.targetClass ? expandTerm(ns.targetClass, prefixes) : null;
          for (const tq of out(v)) {
            if (tq.predicate.value === RDF_TYPE && tq.object.value === nsCls) consumed.add(tq);
          }
          list.push({
            value: v.termType === 'NamedNode' ? v.value : '',
            lang: '',
            node: readNode(v, nestedFieldsOf(ns), depth + 1),
          });
          continue;
        }
        if (f.inversePath && v.termType === 'BlankNode') continue;
        consumed.add(q);
        if (v.termType === 'Literal') {
          list.push({ value: v.value, lang: (v as unknown as { language: string }).language || '' });
        } else {
          list.push({ value: shortenForEnum(v.value, f, prefixes), lang: '' });
        }
      }
      if (list.length) node[fieldKey(f)] = list;
    }
    return node;
  };

  const roots = quads.filter(
    (q) => q.predicate.value === RDF_TYPE && q.object.value === cls,
  );
  const seen = new Set<string>();
  const records: ImportedRecord[] = [];
  for (const tq of roots) {
    if (seen.has(tq.subject.id)) continue;
    seen.add(tq.subject.id);
    consumed.add(tq);
    const values = normalizeRecord(schema, readNode(tq.subject as Term, shapeFields(schema), 0));
    records.push({
      subject: tq.subject.termType === 'NamedNode' ? tq.subject.value : '',
      subjectIsBlank: tq.subject.termType !== 'NamedNode',
      values,
    });
  }
  const unmapped = quads.filter((q) => !consumed.has(q)).length;
  return { records, unmapped, error: records.length ? null : 'noRecords' };
}
