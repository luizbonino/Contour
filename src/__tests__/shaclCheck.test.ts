import { describe, it, expect } from 'vitest';
import { DataFactory } from '../rdf';
import { parseShacl } from '../shacl';
import { normalizeRecord, validateRecord } from '../record';
import { checkRecordShacl } from '../shaclCheck';

const { namedNode, quad } = DataFactory;
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const FOAF = 'http://xmlns.com/foaf/0.1/';

// sh:languageIn and the nested sh:node are enforced only by the full check /
// structure; sh:languageIn is not modeled, so it lives in the residual graph.
const TTL = `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix dash: <http://datashapes.org/dash#> .
@prefix dct: <http://purl.org/dc/terms/> . @prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <${FOAF}> . @prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> . @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix : <https://example.org/shapes/> .
:DatasetShape a sh:NodeShape ; sh:targetClass dcat:Dataset ;
  sh:property [ sh:path dct:title ; sh:name "Title" ; sh:datatype rdf:langString ; sh:minCount 1 ;
                sh:languageIn ( "en" ) ; dash:editor dash:TextFieldEditor ] ;
  sh:property [ sh:path dct:publisher ; sh:name "Publisher" ; sh:nodeKind sh:IRI ; sh:class foaf:Agent ;
                dash:editor dash:AutoCompleteEditor ] ;
  sh:property [ sh:path dcat:contactPoint ; sh:name "Contact" ; sh:node :ContactShape ; dash:editor dash:DetailsEditor ] .
:ContactShape a sh:NodeShape ; sh:targetClass vcard:Kind ;
  sh:property [ sh:path vcard:fn ; sh:name "Full name" ; sh:datatype xsd:string ; sh:minCount 1 ; dash:editor dash:TextFieldEditor ] ;
  sh:property [ sh:path vcard:hasEmail ; sh:name "Email" ; sh:nodeKind sh:IRI ; dash:editor dash:URIEditor ] .`;

const S = 'https://example.org/dataset/1';
const PUB = 'https://example.org/agent/ut';

describe('full SHACL check', () => {
  const schema = parseShacl(TTL).schema!;
  const fill = () => {
    const v = normalizeRecord(schema, {});
    v['dct:title'][0] = { value: 'Air', lang: 'en' };
    v['dct:publisher'][0].value = PUB;
    return v;
  };
  const personType = [
    quad(namedNode(PUB), namedNode(RDF_TYPE), namedNode(FOAF + 'Person')),
    quad(namedNode(FOAF + 'Person'), namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), namedNode(FOAF + 'Agent')),
  ];

  it('keeps sh:languageIn in the residual graph (not a built-in check)', () => {
    expect(schema.residual).toContain('languageIn');
  });

  it('conforms when the linked resource is typed (via a subclass)', async () => {
    const r = await checkRecordShacl(schema, S, fill(), personType);
    expect(r.findings).toEqual([]);
    expect(r.conforms).toBe(true);
  });

  it('checks sh:class against the linked resource type', async () => {
    const r = await checkRecordShacl(schema, S, fill());
    expect(r.findings.map((f) => `${f.loc}:${f.component}`)).toEqual(['dct:publisher:Class']);
    expect(r.findings[0].value).toBe(PUB);
  });

  it('catches constraints the built-in checks do not model', async () => {
    const v = fill();
    v['dct:title'][0].lang = 'nl';
    expect(validateRecord(schema, S, v).map((i) => i.code)).toEqual([]);
    const r = await checkRecordShacl(schema, S, v, personType);
    expect(r.findings.map((f) => `${f.loc}:${f.component}:${f.fieldName}`)).toEqual(['dct:title:LanguageIn:Title']);
  });

  it('reports nested sub-form problems at the nested field', async () => {
    const v = fill();
    v['dcat:contactPoint'][0].node!['vcard:hasEmail'][0].value = 'mailto:a@b.org'; // started, but no name
    const r = await checkRecordShacl(schema, S, v, personType);
    expect(r.findings.map((f) => `${f.loc}:${f.component}`)).toEqual(['dcat:contactPoint/0/vcard:fn:MinCount']);
  });

  it('reports missing required values', async () => {
    const v = fill();
    v['dct:title'][0].value = '';
    const r = await checkRecordShacl(schema, S, v, personType);
    expect(r.conforms).toBe(false);
    expect(r.findings[0]).toMatchObject({ loc: 'dct:title', component: 'MinCount', severity: 'error' });
  });
});
