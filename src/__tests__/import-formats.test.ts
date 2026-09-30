import { describe, it, expect } from 'vitest';
import { EXAMPLES } from '../data';
import { detectSyntax, parseRdf } from '../rdf';
import type { Quad } from '../rdf';
import { parseShacl, serializeSchema } from '../shacl';
import { normalizeRecord, serializeRecord, recordToQuads, importRecords } from '../record';
import type { Schema } from '../types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const dataset = (): Schema => clone(EXAMPLES.find((e) => e.id === 'dataset')!.schema);

// Graph comparison with blank nodes masked (labels differ between parses).
const term = (t: Quad['object']) =>
  t.termType === 'BlankNode' ? '_' : t.termType === 'Literal'
    ? `"${t.value}"@${(t as any).language}^^${(t as any).datatype?.value}` : `<${t.value}>`;
const shape = (qs: Quad[]) => qs.map((q) => `${term(q.subject as any)} ${term(q.predicate as any)} ${term(q.object)}`).sort();

const SKOS_TTL = `@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix ex: <https://example.org/voc/> .
ex:scheme a skos:ConceptScheme ; skos:prefLabel "Environment"@en .
ex:air a skos:Concept ; skos:prefLabel "Air quality"@en, "Luchtkwaliteit"@nl ; skos:inScheme ex:scheme ; skos:notation 42 .
ex:water a skos:Concept ; skos:prefLabel "Water"@en ; skos:broader [ skos:prefLabel "Nature"@en ] .`; // xml:lang is inherited in RDF/XML

describe('JSON-LD import', () => {
  it('reads back Contour’s own JSON-LD export (schema and record)', () => {
    const schema = dataset();
    const ttl = parseRdf(serializeSchema(schema, 'turtle'), 'turtle').quads;
    const jl = parseRdf(serializeSchema(schema, 'jsonld'), 'jsonld');
    expect(jl.error).toBeNull();
    expect(shape(jl.quads)).toEqual(shape(ttl));

    const v = normalizeRecord(schema, {});
    v['dct:title'][0].value = 'Air';
    v['dct:title'][0].lang = 'en';
    v['dct:issued'][0].value = '2025-01-02';
    v['dcat:contactPoint'][0].node!['vcard:fn'][0].value = 'Jane';
    const S = 'https://example.org/dataset/air';
    const rec = parseRdf(serializeRecord(schema, S, v, 'jsonld'), 'jsonld');
    expect(shape(rec.quads)).toEqual(shape(recordToQuads(schema, S, v)));
  });

  it('opens a schema saved as JSON-LD', () => {
    const r = parseShacl(serializeSchema(dataset(), 'jsonld'), 'jsonld');
    expect(r.error).toBeNull();
    expect(r.schema!.groups.flatMap((g) => g.fields).map((f) => f.path)).toContain('dct:title');
  });

  it('handles contexts: terms, @vocab, @base, coercion, @list, nesting, @graph', () => {
    const doc = {
      '@context': {
        '@vocab': 'http://schema.org/',
        '@base': 'https://example.org/',
        dct: 'http://purl.org/dc/terms/',
        issued: { '@id': 'dct:issued', '@type': 'http://www.w3.org/2001/XMLSchema#date' },
        homepage: { '@id': 'http://xmlns.com/foaf/0.1/homepage', '@type': '@id' },
        tags: { '@id': 'dct:subject', '@container': '@list' },
        title: { '@id': 'dct:title', '@language': 'en' },
      },
      '@graph': [
        {
          '@id': 'dataset/1', '@type': 'Dataset', title: 'Air', issued: '2025-01-02',
          homepage: 'page', tags: ['a', 'b'], size: 3, ratio: 0.5, open: true,
          author: { name: 'Ada' },
        },
      ],
    };
    const q = parseRdf(JSON.stringify(doc), 'jsonld').quads;
    const get = (p: string) => q.find((x) => x.predicate.value === p)!.object as any;
    expect(q.find((x) => x.predicate.value.endsWith('#type'))!.object.value).toBe('http://schema.org/Dataset');
    expect(q[0].subject.value).toBe('https://example.org/dataset/1');
    expect(get('http://purl.org/dc/terms/title').language).toBe('en');
    expect(get('http://purl.org/dc/terms/issued').datatype.value).toBe('http://www.w3.org/2001/XMLSchema#date');
    expect(get('http://xmlns.com/foaf/0.1/homepage').value).toBe('https://example.org/page');
    expect(get('http://schema.org/size').datatype.value).toBe('http://www.w3.org/2001/XMLSchema#integer');
    expect(get('http://schema.org/ratio').value).toBe('5.0E-1');
    expect(get('http://schema.org/open').value).toBe('true');
    expect(get('http://purl.org/dc/terms/subject').termType).toBe('BlankNode'); // list head
    expect(q.filter((x) => x.predicate.value.endsWith('#first')).map((x) => x.object.value)).toEqual(['a', 'b']);
    expect(get('http://schema.org/name').value).toBe('Ada');
  });

  it('imports records from JSON-LD and rejects remote contexts', () => {
    const doc = { '@context': { dct: 'http://purl.org/dc/terms/', dcat: 'http://www.w3.org/ns/dcat#' },
      '@id': 'https://x.org/d', '@type': 'dcat:Dataset', 'dct:title': 'From JSON-LD' };
    const res = importRecords(JSON.stringify(doc), 'jsonld', dataset());
    expect(res.records[0].values['dct:title'][0].value).toBe('From JSON-LD');
    expect(parseRdf('{"@context": "https://schema.org/", "name": "x"}', 'jsonld').error).toBe('remoteContext');
    expect(parseRdf('{ not json', 'jsonld').error).toBeTruthy();
  });
});

describe('RDF/XML import', () => {
  const XMLDOC = `<?xml version="1.0"?>
<!DOCTYPE rdf:RDF [ <!ENTITY ex "https://example.org/voc/"> <!ENTITY xsd "http://www.w3.org/2001/XMLSchema#"> ]>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:skos="http://www.w3.org/2004/02/skos/core#" xml:base="https://example.org/voc/">
  <skos:ConceptScheme rdf:about="scheme"><skos:prefLabel xml:lang="en">Environment</skos:prefLabel></skos:ConceptScheme>
  <rdf:Description rdf:about="&ex;air">
    <rdf:type rdf:resource="http://www.w3.org/2004/02/skos/core#Concept"/>
    <skos:prefLabel xml:lang="en">Air quality</skos:prefLabel>
    <skos:prefLabel xml:lang="nl">Luchtkwaliteit</skos:prefLabel>
    <skos:inScheme rdf:resource="#scheme"/>
    <skos:notation rdf:datatype="&xsd;integer">42</skos:notation>
  </rdf:Description>
  <skos:Concept rdf:ID="water" skos:prefLabel="Water" xml:lang="en">
    <skos:broader rdf:parseType="Resource"><skos:prefLabel>Nature</skos:prefLabel></skos:broader>
  </skos:Concept>
</rdf:RDF>`;

  it('matches the equivalent Turtle', () => {
    const xml = parseRdf(XMLDOC, 'rdfxml');
    expect(xml.error).toBeNull();
    const ttl = parseRdf(SKOS_TTL, 'turtle').quads;
    // rdf:about="scheme" resolves against xml:base; rdf:ID="water" → base#water.
    const fix = (s: string[]) => s.map((x) => x.replace('<https://example.org/voc/scheme>', '<https://example.org/voc/#scheme>').replace('<https://example.org/voc/#water>', '<https://example.org/voc/water>')).sort();
    expect(fix(shape(xml.quads))).toEqual(fix(shape(ttl)));
    expect(xml.prefixes.map((p) => p.prefix)).toContain('skos');
  });

  it('handles collections, rdf:li, nodeID, XML literals and nested node elements', () => {
    const doc = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:ex="https://x.org/">
      <rdf:Description rdf:about="https://x.org/a">
        <ex:list rdf:parseType="Collection"><rdf:Description rdf:about="https://x.org/1"/><rdf:Description rdf:about="https://x.org/2"/></ex:list>
        <ex:bag><rdf:Bag><rdf:li>one</rdf:li><rdf:li>two</rdf:li></rdf:Bag></ex:bag>
        <ex:friend rdf:nodeID="n1"/>
        <ex:note rdf:parseType="Literal"><b>bold</b></ex:note>
        <ex:maker><ex:Person><ex:name>Ada</ex:name></ex:Person></ex:maker>
      </rdf:Description>
      <rdf:Description rdf:nodeID="n1"><ex:name>Bob</ex:name></rdf:Description>
    </rdf:RDF>`;
    const q = parseRdf(doc, 'rdfxml').quads;
    const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    expect(q.filter((x) => x.predicate.value === RDF + 'first').map((x) => x.object.value)).toEqual(['https://x.org/1', 'https://x.org/2']);
    expect(q.filter((x) => x.predicate.value.startsWith(RDF + '_')).map((x) => x.predicate.value.slice(-2))).toEqual(['_1', '_2']);
    const friend = q.find((x) => x.predicate.value === 'https://x.org/friend')!.object;
    expect(q.find((x) => x.subject.equals(friend as any))!.object.value).toBe('Bob');
    const note = q.find((x) => x.predicate.value === 'https://x.org/note')!.object as any;
    expect(note.datatype.value).toBe(RDF + 'XMLLiteral');
    expect(note.value).toContain('<b');
    expect(q.some((x) => x.object.value === 'https://x.org/Person')).toBe(true);
  });

  it('reports malformed XML and picks the syntax from the extension', () => {
    expect(parseRdf('<rdf:RDF><oops></rdf:RDF>', 'rdfxml').error).toBeTruthy();
    expect(detectSyntax('onto.owl')).toBe('rdfxml');
    expect(detectSyntax('vocab.rdf')).toBe('rdfxml');
    expect(detectSyntax('record.json')).toBe('jsonld');
  });
});
