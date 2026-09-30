import { describe, it, expect } from 'vitest';
import { EXAMPLES } from '../data';
import { parseRdf } from '../rdf';
import type { Schema } from '../types';
import {
  expandTerm,
  importRecords,
  mintSubject,
  normalizeRecord,
  recordTitle,
  recordToQuads,
  serializeRecord,
  slugify,
  validateRecord,
  type RecordNode,
} from '../record';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const dataset = (): Schema => clone(EXAMPLES.find((e) => e.id === 'dataset')!.schema);

const S = 'https://example.org/dataset/air-quality';
const DCT = 'http://purl.org/dc/terms/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

function filled(schema: Schema): RecordNode {
  const v = normalizeRecord(schema, {});
  v['dct:title'][0].value = 'Air quality';
  v['dct:title'][0].lang = 'en';
  v['dct:description'][0].value = 'Hourly measurements';
  v['dct:issued'][0].value = '2025-03-01';
  v['dcat:keyword'] = [{ value: 'air' }, { value: 'quality' }];
  v['dct:publisher'][0].value = 'https://example.org/agent/utwente';
  v['dct:accessRights'][0].value = 'public';
  v['dcat:contactPoint'][0].node!['vcard:fn'][0].value = 'Jane Doe';
  v['dcat:contactPoint'][0].node!['vcard:hasEmail'][0].value = 'mailto:jane@example.org';
  return v;
}

describe('record model', () => {
  it('seeds each field with its minimum number of entries, recursively', () => {
    const v = normalizeRecord(dataset(), {});
    expect(v['dct:title']).toHaveLength(1);
    expect(v['dcat:keyword']).toHaveLength(1); // ≥1 so something shows
    expect(v['dcat:contactPoint'][0].node!['vcard:fn']).toHaveLength(1);
  });

  it('expands CURIEs, <iri> and absolute IRIs', () => {
    const p = dataset().prefixes;
    expect(expandTerm('dct:title', p)).toBe(DCT + 'title');
    expect(expandTerm('<https://x.org/a>', p)).toBe('https://x.org/a');
    expect(expandTerm('mailto:a@b.org', p)).toBe('mailto:a@b.org');
    expect(expandTerm('not an iri', p)).toBeNull();
    // well-known prefixes resolve even when undeclared
    expect(expandTerm('skos:Concept', [])).toBe('http://www.w3.org/2004/02/skos/core#Concept');
  });

  it('mints subject IRIs from the base, class and title slug', () => {
    expect(slugify('Air Quality – Enschede 2025!')).toBe('air-quality-enschede-2025');
    expect(mintSubject('https://example.org', 'http://www.w3.org/ns/dcat#Dataset', 'x')).toBe(
      'https://example.org/dataset/x',
    );
    expect(mintSubject('https://example.org/', '', '')).toMatch(/^https:\/\/example\.org\/record\/[a-z0-9]{8}$/);
    const s = dataset();
    expect(recordTitle(s, filled(s))).toBe('Air quality');
  });
});

describe('record → RDF', () => {
  const schema = dataset();
  const values = filled(schema);
  const quads = recordToQuads(schema, S, values);
  const obj = (pred: string) => quads.filter((q) => q.subject.value === S && q.predicate.value === pred).map((q) => q.object);

  it('types the subject with the target class', () => {
    expect(obj('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')[0].value).toBe('http://www.w3.org/ns/dcat#Dataset');
  });

  it('writes typed / language-tagged literals and IRIs', () => {
    const title = obj(DCT + 'title')[0] as any;
    expect(title.value).toBe('Air quality');
    expect(title.language).toBe('en');
    const issued = obj(DCT + 'issued')[0] as any;
    expect(issued.datatype.value).toBe(XSD + 'date');
    expect(obj(DCT + 'publisher')[0].termType).toBe('NamedNode');
    expect(obj('http://www.w3.org/ns/dcat#keyword').map((o) => o.value)).toEqual(['air', 'quality']);
  });

  it('skips empty values and emits nested sub-forms as typed blank nodes', () => {
    const cp = obj('http://www.w3.org/ns/dcat#contactPoint');
    expect(cp).toHaveLength(1);
    expect(cp[0].termType).toBe('BlankNode');
    const nested = quads.filter((q) => q.subject.equals(cp[0] as any));
    expect(nested.map((q) => q.predicate.value)).toContain('http://www.w3.org/2006/vcard/ns#fn');
    expect(nested.some((q) => q.object.value === 'http://www.w3.org/2006/vcard/ns#Kind')).toBe(true);

    const empty = normalizeRecord(schema, {});
    const q2 = recordToQuads(schema, S, empty);
    expect(q2).toHaveLength(1); // only rdf:type
  });

  it('prints clean Turtle: used prefixes only, nested nodes inline', () => {
    const ttl = serializeRecord(schema, S, values, 'turtle');
    expect(ttl).toContain('@prefix dct:');
    expect(ttl).not.toContain('@prefix sh:');
    expect(ttl).not.toContain('@prefix dash:');
    expect(ttl).toMatch(/dcat:contactPoint \[/);
    expect(ttl).not.toMatch(/_:/);
    expect(parseRdf(ttl, 'turtle').quads).toHaveLength(quads.length);
  });

  it('escapes literals and falls back to <iri> for awkward local names', () => {
    const s = dataset();
    const v = filled(s);
    v['dct:description'][0].value = 'Line 1\nsaid "hi" \\ back';
    v['dct:publisher'][0].value = 'http://purl.org/dc/terms/a/b.';
    v['dcat:keyword'] = [{ value: 'x' }];
    const ttl = serializeRecord(s, S, v, 'turtle');
    expect(ttl).not.toContain('@prefix rdf:'); // rdf:type prints as `a`
    expect(ttl).toContain('<http://purl.org/dc/terms/a/b.>');
    const back = parseRdf(ttl, 'turtle').quads.find((q) => q.predicate.value === DCT + 'description')!;
    expect(back.object.value).toBe('Line 1\nsaid "hi" \\ back');
  });

  it('serializes to every syntax', () => {
    for (const id of ['ntriples', 'trig', 'n3']) {
      const text = serializeRecord(schema, S, values, id);
      expect(parseRdf(text, id).error).toBeNull();
      expect(parseRdf(text, id).quads).toHaveLength(quads.length);
    }
    const doc = JSON.parse(serializeRecord(schema, S, values, 'jsonld'));
    expect(doc['@graph'][0]['@id']).toBe(S);
  });

  it('writes inverse paths with the value as subject', () => {
    const s = dataset();
    const kw = s.groups[0].fields.find((f) => f.path === 'dcat:keyword')!;
    Object.assign(kw, { widgetId: 'URIEditor', path: 'dct:hasPart', inversePath: true, nodeKind: 'sh:IRI' });
    const v = normalizeRecord(s, {});
    v['^dct:hasPart'][0].value = 'https://example.org/catalog/c1';
    const inv = recordToQuads(s, S, v).find((q) => q.predicate.value === DCT + 'hasPart')!;
    expect(inv.subject.value).toBe('https://example.org/catalog/c1');
    expect(inv.object.value).toBe(S);
  });
});

describe('record validation', () => {
  const schema = dataset();
  const codes = (v: RecordNode, subject = S, others: string[] = []) =>
    validateRecord(schema, subject, v, others).map((i) => `${i.loc}:${i.code}`);

  it('accepts a complete record', () => {
    expect(codes(filled(schema))).toEqual([]);
  });

  it('flags missing required values, but not inside an untouched sub-form', () => {
    const c = codes(normalizeRecord(schema, {}));
    expect(c).toContain('dct:title:minCount');
    expect(c).toContain('dct:publisher:minCount');
    expect(c.some((x) => x.startsWith('dcat:contactPoint/'))).toBe(false);
  });

  it('checks required fields of a sub-form once it is started', () => {
    const v = filled(schema);
    v['dcat:contactPoint'][0].node!['vcard:fn'][0].value = '';
    expect(codes(v)).toContain('dcat:contactPoint/0/vcard:fn:minCount');
  });

  it('checks datatype, IRI, sh:in, max count and the subject', () => {
    const v = filled(schema);
    v['dct:issued'][0].value = '2025-13-45';
    v['dct:publisher'][0].value = 'not an iri';
    v['dct:accessRights'][0].value = 'secret';
    v['dct:title'].push({ value: 'Second title' });
    const c = codes(v, 'no-iri');
    expect(c).toEqual(expect.arrayContaining([
      ':subjectInvalid', 'dct:issued:datatype', 'dct:publisher:iri', 'dct:accessRights:in', 'dct:title:maxCount',
    ]));
    expect(codes(filled(schema), S, [S])).toContain(':subjectDuplicate');
  });

  it('checks length, pattern, ranges and language tags, honouring sh:message / severity', () => {
    const s = dataset();
    const title = s.groups[0].fields[0];
    Object.assign(title, { maxLength: 5, pattern: '^[A-Z]', message: 'Use a short capitalised title', severity: 'sh:Warning' });
    const issued = s.groups[0].fields.find((f) => f.path === 'dct:issued')!;
    issued.minInclusive = '2020-01-01';
    const v = filled(s);
    v['dct:title'][0].value = 'air quality';
    v['dct:title'][0].lang = 'en_GB';
    v['dct:issued'][0].value = '2019-05-05';
    const issues = validateRecord(s, S, v);
    const t = issues.filter((i) => i.loc === 'dct:title');
    expect(t.map((i) => i.code).sort()).toEqual(['langInvalid', 'maxLength', 'pattern']);
    expect(t.every((i) => i.severity === 'warning' && i.message === 'Use a short capitalised title')).toBe(true);
    expect(issues.find((i) => i.loc === 'dct:issued')?.code).toBe('minInclusive');
  });
});

describe('record import', () => {
  const schema = dataset();

  it('round-trips fill → Turtle → import', () => {
    const values = filled(schema);
    const ttl = serializeRecord(schema, S, values, 'turtle');
    const res = importRecords(ttl, 'turtle', schema);
    expect(res.error).toBeNull();
    expect(res.unmapped).toBe(0);
    expect(res.records).toHaveLength(1);
    const r = res.records[0];
    expect(r.subject).toBe(S);
    expect(recordToQuads(schema, S, r.values)).toHaveLength(recordToQuads(schema, S, values).length);
    expect(r.values['dct:title'][0]).toMatchObject({ value: 'Air quality', lang: 'en' });
    expect(r.values['dcat:contactPoint'][0].node!['vcard:fn'][0].value).toBe('Jane Doe');
  });

  it('imports several records and counts triples the form cannot hold', () => {
    const ttl = `@prefix dcat: <http://www.w3.org/ns/dcat#> . @prefix dct: <http://purl.org/dc/terms/> .
      <https://x.org/a> a dcat:Dataset ; dct:title "A" ; dct:spatial <https://x.org/place> .
      <https://x.org/b> a dcat:Dataset ; dct:title "B" .
      <https://x.org/c> a dcat:Catalog .`;
    const res = importRecords(ttl, 'turtle', schema);
    expect(res.records.map((r) => r.subject)).toEqual(['https://x.org/a', 'https://x.org/b']);
    expect(res.unmapped).toBe(2); // dct:spatial + the catalog's type
  });

  it('maps IRI enum values back to their sh:in CURIE', () => {
    const s = dataset();
    const ar = s.groups[1].fields.find((f) => f.path === 'dct:accessRights')!;
    ar.nodeKind = 'sh:IRI';
    ar.inValues = [{ value: ':public', kind: 'iri' }, { value: ':private', kind: 'iri' }];
    const ttl = `<https://x.org/a> a <http://www.w3.org/ns/dcat#Dataset> ; <http://purl.org/dc/terms/accessRights> <http://fairdatapoint.org/public> .`;
    const r = importRecords(ttl, 'turtle', s).records[0];
    expect(r.values['dct:accessRights'][0].value).toBe(':public');
    expect(recordToQuads(s, 'https://x.org/a', r.values).some((q) => q.object.value === 'http://fairdatapoint.org/public')).toBe(true);
  });

  it('reports files without matching records', () => {
    expect(importRecords('<a:b> <a:c> "x" .', 'turtle', schema).error).toBe('noRecords');
    expect(importRecords('this is not turtle', 'turtle', schema).error).toBeTruthy();
  });
});
