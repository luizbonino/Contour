// @vitest-environment node
// Reads recorded /spec fixtures from disk.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formSchema } from '../forms';
import { DataFactory, parseRdf } from '../rdf';
import { expandTerm, importRecords, shapeFields } from '../record';
import { parseShacl } from '../shacl';
import { checkRecordShacl } from '../shaclCheck';
import type { Schema } from '../types';

const { namedNode, quad } = DataFactory;
const DCAT = 'http://www.w3.org/ns/dcat#';
const FDP = 'https://w3id.org/fdp/fdp-o#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const spec = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/spec-${name}.ttl`, import.meta.url)), 'utf8');
const parse = (ttl: string): Schema => parseShacl(ttl, 'turtle').schema!;
const paths = (s: Schema) => shapeFields(s).map((f) => expandTerm(f.path, s.prefixes)!.replace(/^.*[#/]/, ''));

describe('formSchema (peer shapes from an FDP /spec)', () => {
  it('merges ResourceShape and DatasetShape into one form, general shape first', () => {
    const parsed = parse(spec('dataset'));
    // Contour's own reading: DatasetShape is the form, ResourceShape is nested.
    expect(paths(parsed)).toEqual(['issued', 'modified', 'theme', 'contactPoint', 'keyword', 'landingPage']);

    const form = formSchema(parsed, [`${DCAT}Resource`, `${DCAT}Dataset`]);
    expect(paths(form)).toEqual([
      'title', 'description', 'publisher', 'version', 'language', 'license', 'rights',
      'issued', 'modified', 'theme', 'contactPoint', 'keyword', 'landingPage',
    ]);
    expect(expandTerm(form.targetClass, form.prefixes)).toBe(`${DCAT}Resource`);
    // The Agent shape is not a target class of the type: it stays nested.
    expect(form.nestedShapes.map((n) => n.iri)).toEqual(['<http://fairdatapoint.org/AgentShape>']);
    expect(shapeFields(form).map((f) => f.order)).toEqual(shapeFields(form).map((_, i) => i));
  });

  it('merges all four root shapes of the FDP itself', () => {
    const form = formSchema(parse(spec('fdp')), [`${FDP}MetadataService`, `${DCAT}DataService`, `${DCAT}Resource`, `${FDP}FAIRDataPoint`]);
    const p = paths(form);
    expect(p.slice(0, 2)).toEqual(['endpointURL', 'endpointDescription']); // DataService (MetadataService has no fields)
    expect(p).toContain('title');
    expect(p).toContain('metadataIdentifier');
    expect(form.nestedShapes.map((n) => n.iri)).toEqual(['<http://fairdatapoint.org/AgentShape>']);
  });

  it('keeps a path declared in two shapes once, and leaves an unrelated schema alone', () => {
    const ttl = `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix dct: <http://purl.org/dc/terms/> . @prefix ex: <https://example.org/> .
      ex:A a sh:NodeShape ; sh:targetClass ex:A ; sh:property [ sh:path dct:title ; sh:name "A title" ] .
      ex:B a sh:NodeShape ; sh:targetClass ex:B ; sh:property [ sh:path dct:title ; sh:name "B title" ] , [ sh:path dct:subject ] .`;
    const form = formSchema(parse(ttl), ['https://example.org/B', 'https://example.org/A']);
    expect(shapeFields(form).map((f) => [f.path, f.name])).toEqual([['dct:title', 'B title'], ['dct:subject', '']]);
    const s = parse(ttl);
    expect(formSchema(s, ['https://example.org/Other'])).toBe(s);
  });
});

describe('importRecords keeps the unmapped triples', () => {
  it('returns them next to the count', () => {
    const form = formSchema(parse(spec('dataset')), [`${DCAT}Resource`, `${DCAT}Dataset`]);
    const ttl = `<https://ex.org/d> a <${DCAT}Resource> ; <http://purl.org/dc/terms/title> "T"@en ; <https://ex.org/unknown> "kept" .`;
    const r = importRecords(ttl, 'turtle', form);
    expect(r.records).toHaveLength(1);
    expect(r.unmapped).toBe(1);
    expect(r.unmappedQuads.map((q) => q.predicate.value)).toEqual(['https://ex.org/unknown']);
  });
});

describe('checkRecordShacl against the shapes the FDP serves', () => {
  it('reports a missing title from ResourceShape on a merged dataset form', async () => {
    const form = formSchema(parse(spec('dataset')), [`${DCAT}Resource`, `${DCAT}Dataset`]);
    const S = 'https://ex.org/d';
    const shapes = parseRdf(spec('dataset'), 'turtle').quads;
    const asDataset = [quad(namedNode(S), namedNode(RDF_TYPE), namedNode(`${DCAT}Dataset`))];
    const r = await checkRecordShacl(form, S, {}, asDataset, shapes);
    expect(r.conforms).toBe(false);
    const missing = r.findings.filter((f) => f.component === 'MinCount').map((f) => f.loc);
    expect(missing).toEqual(expect.arrayContaining(['dct:title', 'dct:publisher', 'dcat:theme']));
  });
});
