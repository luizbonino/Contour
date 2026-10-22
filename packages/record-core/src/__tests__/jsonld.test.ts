import { describe, it, expect } from 'vitest';
import { parseShacl, serializeSchema } from '../shacl';

const TTL = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix dash: <http://datashapes.org/dash#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix : <http://example.org/> .
:DatasetShape a sh:NodeShape ; rdfs:label "Dataset" ; sh:targetClass dcat:Dataset ;
  sh:property [ sh:path dct:title ; sh:name "Title" ; sh:datatype xsd:string ; sh:minCount 1 ; dash:editor dash:TextFieldEditor ] ;
  sh:property [ sh:path dct:accessRights ; sh:in ( "public" "private" ) ; dash:editor dash:EnumSelectEditor ] .`;

describe('JSON-LD export', () => {
  const schema = parseShacl(TTL).schema!;
  const out = serializeSchema(schema, 'jsonld');
  const doc = JSON.parse(out) as { '@context': Record<string, string>; '@graph': any[] };

  it('produces valid JSON', () => {
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('builds a @context from the declared prefixes', () => {
    expect(doc['@context'].dct).toBe('http://purl.org/dc/terms/');
    expect(doc['@context'].dcat).toBe('http://www.w3.org/ns/dcat#');
    // empty prefix maps to @vocab/@base
    expect(doc['@context']['@vocab']).toBe('http://example.org/');
  });

  it('emits the shape with @id, @type and an embedded property', () => {
    const shape = doc['@graph'].find((n) => n['@id'] === 'DatasetShape' || n['@id'] === ':DatasetShape' || n['@id']?.endsWith('DatasetShape'));
    expect(shape).toBeTruthy();
    expect(shape['@type']).toContain('sh:NodeShape');
    expect(shape['sh:targetClass']).toEqual({ '@id': 'dcat:Dataset' });
    // sh:property blank nodes embedded (referenced once)
    const props = Array.isArray(shape['sh:property']) ? shape['sh:property'] : [shape['sh:property']];
    const title = props.find((p: any) => p['sh:path']?.['@id'] === 'dct:title');
    expect(title).toBeTruthy();
    expect(title['sh:name']).toBe('Title');
    expect(title['sh:minCount']).toBe(1);
  });

  it('collapses sh:in to a JSON-LD @list', () => {
    const shape = doc['@graph'].find((n) => String(n['@id']).endsWith('DatasetShape'));
    const props = (Array.isArray(shape['sh:property']) ? shape['sh:property'] : [shape['sh:property']]) as any[];
    const rights = props.find((p) => p['sh:path']?.['@id'] === 'dct:accessRights');
    expect(rights['sh:in']).toEqual({ '@list': ['public', 'private'] });
  });

  it('Turtle remains the default serialization', () => {
    expect(serializeSchema(schema)).toContain('@prefix');
    expect(serializeSchema(schema, 'turtle')).toContain('a sh:NodeShape');
  });
});
