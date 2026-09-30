// Small RDF/XML → quads reader (import only), built on the browser's
// DOMParser, so vocabularies published as RDF/XML (many OWL / SKOS files) can
// be used as lookup sources and schemas / records imported. Covers node and
// property elements, rdf:about / rdf:ID / rdf:nodeID / rdf:resource, typed
// node elements, property attributes, xml:lang, rdf:datatype, xml:base,
// rdf:parseType Resource / Literal / Collection, rdf:li and internal entities.
// Reification via rdf:ID on property elements is ignored.
// N3 directly (not ./rdf): rdf.ts imports this module.
import N3 from 'n3';
import type { Quad } from 'n3';

const { DataFactory } = N3;

const { namedNode, blankNode, literal, quad } = DataFactory;
type Term = Quad['object'];
type Subject = Quad['subject'];

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XML = 'http://www.w3.org/XML/1998/namespace';

export class RdfXmlError extends Error {}

// Internal DTD entities (<!ENTITY owl "http://…#">) are common in OWL files;
// expand them ourselves so we don't depend on the parser's DTD support.
function expandEntities(text: string): string {
  const ents = new Map<string, string>();
  const decl = /<!ENTITY\s+([\w.-]+)\s+(["'])([\s\S]*?)\2\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(text)) !== null) ents.set(m[1], m[3]);
  let out = text.replace(/<!DOCTYPE[\s\S]*?\]>\s*/, '').replace(/<!DOCTYPE[^>[]*>\s*/, '');
  for (let pass = 0; pass < 3 && ents.size; pass++) {
    out = out.replace(/&([\w.-]+);/g, (all, name: string) => (ents.has(name) ? ents.get(name)! : all));
  }
  return out;
}

function resolve(ref: string, base: string): string {
  if (!base) return ref;
  try {
    return new URL(ref, base).href;
  } catch {
    return ref;
  }
}

const iriOf = (el: Element): string => (el.namespaceURI || '') + (el.localName || '');

// Attribute namespace, resolved from the in-scope xmlns declarations when the
// DOM doesn't do it (some DOM implementations leave attributes un-namespaced).
function attrName(el: Element, a: Attr): { ns: string | null; local: string } {
  if (a.namespaceURI) return { ns: a.namespaceURI, local: a.localName };
  const c = a.name.indexOf(':');
  if (c < 0) return { ns: null, local: a.name };
  const pfx = a.name.slice(0, c);
  const local = a.name.slice(c + 1);
  if (pfx === 'xmlns') return { ns: 'http://www.w3.org/2000/xmlns/', local };
  if (pfx === 'xml') return { ns: XML, local };
  for (let n: Element | null = el; n; n = n.parentElement) {
    const decl = n.getAttribute(`xmlns:${pfx}`);
    if (decl !== null) return { ns: decl, local };
  }
  return { ns: null, local };
}

function getAttr(el: Element, ns: string, local: string): string | null {
  for (const a of Array.from(el.attributes)) {
    const n = attrName(el, a);
    if (n.ns === ns && n.local === local) return a.value;
  }
  return null;
}

const isNsDecl = (a: Attr) => a.name === 'xmlns' || a.name.startsWith('xmlns:');

const RDF_SYNTAX_ATTRS = new Set(['about', 'ID', 'nodeID', 'resource', 'datatype', 'parseType', 'type']);

export function parseRdfXml(text: string, baseIri = ''): Quad[] {
  const doc = new DOMParser().parseFromString(expandEntities(text), 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new RdfXmlError((err.textContent || 'Invalid XML').trim().split('\n')[0]);
  const out: Quad[] = [];
  const bnodes = new Map<string, Subject>();
  const nodeId = (id: string) => {
    let b = bnodes.get(id);
    if (!b) { b = blankNode(); bnodes.set(id, b); }
    return b;
  };

  const baseOf = (el: Element, inherited: string) => {
    const b = getAttr(el, XML, 'base');
    return b ? resolve(b, inherited) : inherited;
  };
  const langOf = (el: Element, inherited: string) => getAttr(el, XML, 'lang') ?? inherited;
  const rdfAttr = (el: Element, name: string) => getAttr(el, RDF, name);
  const children = (el: Element) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1);

  // Plain (non-syntax) attributes become literal properties; rdf:type an IRI.
  const propertyAttrs = (el: Element, s: Subject, base: string, lang: string) => {
    for (const a of Array.from(el.attributes)) {
      if (isNsDecl(a)) continue;
      const { ns, local } = attrName(el, a);
      if (!ns || ns === XML) continue;
      if (ns === RDF && RDF_SYNTAX_ATTRS.has(local)) {
        if (local === 'type') out.push(quad(s, namedNode(RDF + 'type'), namedNode(resolve(a.value, base))));
        continue;
      }
      out.push(quad(s, namedNode(ns + local), lang ? literal(a.value, lang) : literal(a.value)));
    }
  };

  const nodeElement = (el: Element, base0: string, lang0: string): Subject => {
    const base = baseOf(el, base0);
    const lang = langOf(el, lang0);
    const about = rdfAttr(el, 'about');
    const id = rdfAttr(el, 'ID');
    const nid = rdfAttr(el, 'nodeID');
    const s: Subject =
      about !== null ? namedNode(resolve(about, base))
      : id !== null ? namedNode(resolve('#' + id, base))
      : nid !== null ? nodeId(nid)
      : blankNode();
    if (iriOf(el) !== RDF + 'Description') out.push(quad(s, namedNode(RDF + 'type'), namedNode(iriOf(el))));
    propertyAttrs(el, s, base, lang);
    let li = 0;
    for (const p of children(el)) {
      let pred = iriOf(p);
      if (pred === RDF + 'li') pred = RDF + '_' + ++li;
      propertyElement(p, s, pred, base, lang);
    }
    return s;
  };

  const propertyElement = (el: Element, s: Subject, pred: string, base0: string, lang0: string) => {
    const base = baseOf(el, base0);
    const lang = langOf(el, lang0);
    const p = namedNode(pred);
    const parseType = rdfAttr(el, 'parseType');
    const kids = children(el);

    if (parseType === 'Resource') {
      const b = blankNode();
      out.push(quad(s, p, b));
      let li = 0;
      for (const c of kids) {
        let cp = iriOf(c);
        if (cp === RDF + 'li') cp = RDF + '_' + ++li;
        propertyElement(c, b, cp, base, lang);
      }
      return;
    }
    if (parseType === 'Literal') {
      const xml = Array.from(el.childNodes).map((n) => new XMLSerializer().serializeToString(n)).join('');
      out.push(quad(s, p, literal(xml, namedNode(RDF + 'XMLLiteral'))));
      return;
    }
    if (parseType === 'Collection') {
      const members = kids.map((c) => nodeElement(c, base, lang));
      if (!members.length) { out.push(quad(s, p, namedNode(RDF + 'nil'))); return; }
      const heads = members.map(() => blankNode());
      out.push(quad(s, p, heads[0]));
      members.forEach((m, i) => {
        out.push(quad(heads[i], namedNode(RDF + 'first'), m as Term));
        out.push(quad(heads[i], namedNode(RDF + 'rest'), i + 1 < heads.length ? heads[i + 1] : namedNode(RDF + 'nil')));
      });
      return;
    }

    const resource = rdfAttr(el, 'resource');
    const nid = rdfAttr(el, 'nodeID');
    const hasPropAttrs = Array.from(el.attributes).some((a) => {
      if (isNsDecl(a)) return false;
      const { ns, local } = attrName(el, a);
      return !!ns && ns !== XML && !(ns === RDF && RDF_SYNTAX_ATTRS.has(local) && local !== 'type');
    });
    if (resource !== null || nid !== null || (hasPropAttrs && !kids.length && !(el.textContent || '').trim())) {
      const o: Subject = resource !== null ? namedNode(resolve(resource, base)) : nid !== null ? nodeId(nid) : blankNode();
      out.push(quad(s, p, o as Term));
      propertyAttrs(el, o, base, lang);
      return;
    }
    if (kids.length) {
      out.push(quad(s, p, nodeElement(kids[0], base, lang) as Term));
      return;
    }
    const txt = el.textContent || '';
    const dt = rdfAttr(el, 'datatype');
    out.push(quad(s, p, dt ? literal(txt, namedNode(resolve(dt, base))) : lang ? literal(txt, lang) : literal(txt)));
  };

  const root = doc.documentElement;
  const base = baseOf(root, baseIri);
  const lang = langOf(root, '');
  if (iriOf(root) === RDF + 'RDF') for (const n of children(root)) nodeElement(n, base, lang);
  else nodeElement(root, base, lang);
  return out;
}
