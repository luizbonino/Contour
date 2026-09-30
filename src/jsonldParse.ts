// Small JSON-LD → quads reader (import only), so records, vocabularies and
// schemas exported as JSON-LD can be read back without the heavy `jsonld`
// dependency. Covers inline contexts — terms, prefixes, @vocab, @base,
// @language, @type coercion (@id / @vocab / datatypes), @container @list —
// nested node objects, @graph, @list / @set and value objects. Remote
// (URL) contexts are rejected with a clear error.
// N3 directly (not ./rdf): rdf.ts imports this module.
import N3 from 'n3';
import type { Quad } from 'n3';

const { DataFactory } = N3;

const { namedNode, blankNode, literal, quad } = DataFactory;
type Term = Quad['object'];
type Subject = Quad['subject'];

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

interface TermDef {
  id: string;
  type?: string;      // '@id' | '@vocab' | datatype IRI
  language?: string | null;
  container?: string;
}

interface Ctx {
  terms: Map<string, TermDef>;
  vocab: string | null;
  base: string | null;
  language: string | null;
}

export class JsonLdError extends Error {}

const ABSOLUTE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function resolveRelative(ref: string, base: string | null): string {
  if (!base || ABSOLUTE.test(ref)) return ref;
  try {
    return new URL(ref, base).href;
  } catch {
    return ref;
  }
}

function processContext(active: Ctx, local: unknown): Ctx {
  const ctx: Ctx = { terms: new Map(active.terms), vocab: active.vocab, base: active.base, language: active.language };
  const list = Array.isArray(local) ? local : [local];
  for (const c of list) {
    if (c === null) {
      ctx.terms.clear();
      ctx.vocab = null;
      ctx.language = null;
      continue;
    }
    if (typeof c === 'string') throw new JsonLdError('remoteContext');
    if (typeof c !== 'object') continue;
    const obj = c as Record<string, unknown>;
    if (typeof obj['@base'] === 'string') ctx.base = resolveRelative(obj['@base'] as string, ctx.base);
    if (obj['@base'] === null) ctx.base = null;
    if ('@language' in obj) ctx.language = (obj['@language'] as string | null) ?? null;
    // Terms may refer to each other (prefix:suffix); resolve in a few passes.
    const entries = Object.entries(obj).filter(([k]) => !k.startsWith('@'));
    if (typeof obj['@vocab'] === 'string') ctx.vocab = obj['@vocab'] as string;
    if (obj['@vocab'] === null) ctx.vocab = null;
    for (let pass = 0; pass < 3; pass++) {
      for (const [key, def] of entries) {
        if (def === null) { ctx.terms.delete(key); continue; }
        const d: TermDef = typeof def === 'string' ? { id: def } : { id: '' };
        if (typeof def === 'object') {
          const o = def as Record<string, unknown>;
          d.id = typeof o['@id'] === 'string' ? (o['@id'] as string) : key;
          if (typeof o['@type'] === 'string') d.type = o['@type'] as string;
          if ('@language' in o) d.language = (o['@language'] as string | null) ?? null;
          if (typeof o['@container'] === 'string') d.container = o['@container'] as string;
        }
        const id = expandIri(ctx, d.id, true, key);
        if (!id) continue;
        const type = d.type && !d.type.startsWith('@') ? expandIri(ctx, d.type, true) ?? d.type : d.type;
        ctx.terms.set(key, { ...d, id, type });
      }
    }
    if (typeof obj['@vocab'] === 'string') ctx.vocab = expandIri(ctx, obj['@vocab'] as string, true) ?? ctx.vocab;
  }
  return ctx;
}

/** Expand a term / compact IRI / relative IRI. `vocab` = property or type position. */
function expandIri(ctx: Ctx, value: string, vocab: boolean, self?: string): string | null {
  if (value.startsWith('@')) return value;
  if (vocab && value !== self && ctx.terms.has(value)) return ctx.terms.get(value)!.id;
  if (value.startsWith('_:')) return value;
  const c = value.indexOf(':');
  if (c > 0) {
    const pfx = value.slice(0, c);
    const suffix = value.slice(c + 1);
    if (!suffix.startsWith('//') && pfx !== self && ctx.terms.has(pfx)) return ctx.terms.get(pfx)!.id + suffix;
    if (ABSOLUTE.test(value)) return value;
  }
  if (vocab) return ctx.vocab !== null ? ctx.vocab + value : null;
  return resolveRelative(value, ctx.base);
}

function doubleLexical(n: number): string {
  const [m, e] = n.toExponential().split('e');
  return `${m.includes('.') ? m : m + '.0'}E${Number(e)}`;
}

/** Parse JSON-LD text into quads (default graph only; named graphs are merged). */
export function parseJsonLd(text: string, baseIri: string | null = null): Quad[] {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new JsonLdError(e instanceof Error ? e.message : String(e));
  }
  const out: Quad[] = [];
  const root: Ctx = { terms: new Map(), vocab: null, base: baseIri, language: null };
  const bnodes = new Map<string, Quad['subject']>();
  const bnode = (label?: string) => {
    if (!label) return blankNode();
    let b = bnodes.get(label);
    if (!b) { b = blankNode(); bnodes.set(label, b); }
    return b;
  };
  const iriTerm = (iri: string): Subject => (iri.startsWith('_:') ? bnode(iri) : namedNode(iri));

  const list = (items: unknown[], ctx: Ctx, def: TermDef | undefined): Term => {
    const terms = items.flatMap((it) => values(it, ctx, def));
    if (!terms.length) return namedNode(RDF + 'nil');
    const heads = terms.map(() => blankNode());
    terms.forEach((t, i) => {
      out.push(quad(heads[i], namedNode(RDF + 'first'), t));
      out.push(quad(heads[i], namedNode(RDF + 'rest'), i + 1 < heads.length ? heads[i + 1] : namedNode(RDF + 'nil')));
    });
    return heads[0];
  };

  /** RDF terms for one JSON-LD value (may be an array). */
  const values = (v: unknown, ctx: Ctx, def: TermDef | undefined): Term[] => {
    if (v === null || v === undefined) return [];
    if (Array.isArray(v)) {
      if (def?.container === '@list') return [list(v, ctx, def)];
      return v.flatMap((x) => values(x, ctx, def));
    }
    if (typeof v === 'string') {
      if (def?.type === '@id') return [iriTerm(expandIri(ctx, v, false) ?? v)];
      if (def?.type === '@vocab') return [iriTerm(expandIri(ctx, v, true) ?? v)];
      if (def?.type && !def.type.startsWith('@')) return [literal(v, namedNode(def.type))];
      const lang = def && 'language' in def ? def.language : ctx.language;
      return [lang ? literal(v, lang) : literal(v)];
    }
    if (typeof v === 'number') {
      if (def?.type && !def.type.startsWith('@')) return [literal(String(v), namedNode(def.type))];
      return Number.isInteger(v)
        ? [literal(String(v), namedNode(XSD + 'integer'))]
        : [literal(doubleLexical(v), namedNode(XSD + 'double'))];
    }
    if (typeof v === 'boolean') return [literal(String(v), namedNode(XSD + 'boolean'))];
    if (typeof v !== 'object') return [];
    const o = v as Record<string, unknown>;
    if ('@value' in o) {
      const val = o['@value'];
      if (val === null) return [];
      const lex = typeof val === 'number' && !Number.isInteger(val) ? doubleLexical(val) : String(val);
      if (typeof o['@language'] === 'string') return [literal(lex, o['@language'] as string)];
      if (typeof o['@type'] === 'string') {
        const dt = expandIri(ctx, o['@type'] as string, true);
        if (dt) return [literal(lex, namedNode(dt))];
      }
      if (typeof val === 'number' || typeof val === 'boolean') return values(val, ctx, undefined);
      return [literal(lex)];
    }
    if ('@list' in o) return [list(Array.isArray(o['@list']) ? o['@list'] : [o['@list']], ctx, def)];
    if ('@set' in o) return values(o['@set'], ctx, def);
    return [node(o, ctx)];
  };

  /** Emit a node object's triples; returns its subject. */
  const node = (o: Record<string, unknown>, parent: Ctx): Subject => {
    const ctx = '@context' in o ? processContext(parent, o['@context']) : parent;
    const id = typeof o['@id'] === 'string' ? expandIri(ctx, o['@id'] as string, false) : null;
    const s: Subject = id ? iriTerm(id) : bnode();
    const types = o['@type'] === undefined ? [] : Array.isArray(o['@type']) ? o['@type'] : [o['@type']];
    for (const ty of types) {
      if (typeof ty !== 'string') continue;
      const iri = expandIri(ctx, ty, true);
      if (iri) out.push(quad(s, namedNode(RDF + 'type'), iriTerm(iri) as Term));
    }
    for (const [key, val] of Object.entries(o)) {
      if (key === '@graph') {
        for (const g of Array.isArray(val) ? val : [val]) if (g && typeof g === 'object') node(g as Record<string, unknown>, ctx);
        continue;
      }
      if (key === '@reverse' && val && typeof val === 'object') {
        for (const [rk, rv] of Object.entries(val as Record<string, unknown>)) {
          const p = expandIri(ctx, rk, true);
          if (!p || p.startsWith('@')) continue;
          for (const t of values(rv, ctx, ctx.terms.get(rk))) {
            if (t.termType !== 'Literal') out.push(quad(t as Subject, namedNode(p), s as Term));
          }
        }
        continue;
      }
      if (key.startsWith('@')) continue;
      const p = expandIri(ctx, key, true);
      if (!p || p.startsWith('@') || p.startsWith('_:')) continue; // unmapped key: dropped, as in JSON-LD
      for (const t of values(val, ctx, ctx.terms.get(key))) out.push(quad(s, namedNode(p), t));
    }
    return s;
  };

  const top = (d: unknown, ctx: Ctx) => {
    if (Array.isArray(d)) { d.forEach((x) => top(x, ctx)); return; }
    if (!d || typeof d !== 'object') return;
    const o = d as Record<string, unknown>;
    const c = '@context' in o ? processContext(ctx, o['@context']) : ctx;
    // A bare { @context, @graph } wrapper is not itself a node.
    const keys = Object.keys(o).filter((k) => k !== '@context');
    if (keys.length === 1 && keys[0] === '@graph') {
      for (const g of Array.isArray(o['@graph']) ? o['@graph'] : [o['@graph']]) top(g, c);
      return;
    }
    node(o, ctx);
  };
  top(doc, root);
  return out;
}
