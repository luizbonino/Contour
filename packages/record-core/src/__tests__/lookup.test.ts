import { describe, it, expect } from 'vitest';
import { parseRdf } from '../rdf';
import { BUILTIN_SUBCLASSES, indexQuads, searchLookup, subclassPairs, superclassMap } from '../lookup';

const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const FOAF = 'http://xmlns.com/foaf/0.1/';

const VOCAB = `@prefix skos: <${SKOS}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix ex: <https://example.org/voc/> .
ex:air a skos:Concept ; skos:prefLabel "Air quality"@en, "Luchtkwaliteit"@nl .
ex:water a skos:Concept ; skos:prefLabel "Water"@en .
ex:Sensor rdfs:subClassOf skos:Concept .
ex:s1 a ex:Sensor ; rdfs:label "Sensor one" .
ex:scheme a skos:ConceptScheme ; rdfs:label "Environment" .`;

describe('lookup index', () => {
  const quads = parseRdf(VOCAB, 'turtle').quads;
  const items = indexQuads(quads, 'env.ttl', 'vocab');
  const supers = superclassMap([...BUILTIN_SUBCLASSES, ...subclassPairs(quads)]);

  it('indexes IRI subjects with their best label and types', () => {
    const air = items.find((i) => i.iri.endsWith('air'))!;
    expect(air.label).toBe('Air quality');
    expect(air.types).toEqual([SKOS + 'Concept']);
    expect(indexQuads(quads, 'env.ttl', 'vocab', 'nl').find((i) => i.iri.endsWith('air'))!.label).toBe('Luchtkwaliteit');
  });

  it('filters by class, including stated and built-in subclasses', () => {
    const concepts = searchLookup(items, { classIri: SKOS + 'Concept', text: '' }, supers);
    expect(concepts.map((i) => i.label).sort()).toEqual(['Air quality', 'Sensor one', 'Water']);
    const person = indexQuads(
      parseRdf(`<https://x.org/p> a <${FOAF}Person> ; <${FOAF}name> "Ada" .`, 'turtle').quads,
      'Agent',
      'record',
    );
    expect(searchLookup(person, { classIri: FOAF + 'Agent', text: 'ad' }, supers)).toHaveLength(1);
  });

  it('ranks label prefix matches first and also matches IRIs', () => {
    const res = searchLookup(items, { classIri: null, text: 'wa' }, supers);
    expect(res[0].label).toBe('Water');
    expect(searchLookup(items, { classIri: null, text: 'voc/scheme' }, supers)[0].label).toBe('Environment');
  });
});
