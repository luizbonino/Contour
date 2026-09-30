import { describe, it, expect } from 'vitest';
import { EXAMPLES } from '../data';
import { parseShacl, serializeSchema, CONTOUR_NS } from '../shacl';
import { remoteSearch, sparqlQuery, RemoteLookupError, type FetchLike } from '../remote';
import type { Schema } from '../types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function fakeFetch(body: unknown, calls: string[] = [], status = 200): FetchLike {
  return async (url) => {
    calls.push(url);
    return { ok: status < 400, status, json: async () => (typeof body === 'function' ? (body as (u: string) => unknown)(url) : body) };
  };
}

describe('lookup annotation round-trip', () => {
  const withLookup = (): Schema => {
    const s = clone(EXAMPLES.find((e) => e.id === 'dataset')!.schema);
    const pub = s.groups[1].fields.find((f) => f.path === 'dct:publisher')!;
    pub.lookup = { service: 'wikidata', filter: 'Q43229' };
    const kw = s.groups[0].fields.find((f) => f.path === 'dcat:keyword')!;
    Object.assign(kw, { widgetId: 'AutoCompleteEditor', nodeKind: 'sh:IRI' });
    kw.lookup = { service: 'sparql', endpoint: 'https://example.org/sparql' };
    return s;
  };

  it('generates full IRIs without a declared prefix, and parses them back as model', () => {
    const ttl = serializeSchema(withLookup(), 'turtle');
    expect(ttl).toContain(`<${CONTOUR_NS}lookupService> <${CONTOUR_NS}Wikidata>`);
    expect(ttl).toContain(`<${CONTOUR_NS}lookupEndpoint> <https://example.org/sparql>`);
    const back = parseShacl(ttl).schema!;
    const fields = back.groups.flatMap((g) => g.fields);
    expect(fields.find((f) => f.path === 'dct:publisher')!.lookup).toEqual({ service: 'wikidata', filter: 'Q43229' });
    expect(fields.find((f) => f.path === 'dcat:keyword')!.lookup).toEqual({ service: 'sparql', endpoint: 'https://example.org/sparql' });
    expect(back.residual).toBeUndefined();
  });

  it('uses the declared alias when the contour prefix is present', () => {
    const s = withLookup();
    s.prefixes.push({ prefix: 'contour', uri: CONTOUR_NS });
    const ttl = serializeSchema(s, 'turtle');
    expect(ttl).toContain('contour:lookupService contour:Wikidata');
    expect(parseShacl(ttl).schema!.groups[1].fields[0].lookup?.service).toBe('wikidata');
  });

  it('keeps an unknown service in the residual graph', () => {
    const ttl = serializeSchema(withLookup(), 'turtle').replace(`${CONTOUR_NS}Wikidata`, `${CONTOUR_NS}Other`);
    const back = parseShacl(ttl).schema!;
    expect(back.groups[1].fields[0].lookup).toBeUndefined();
    expect(back.residual).toContain('lookupService');
  });
});

describe('remote search', () => {
  it('queries a SPARQL endpoint by class and label', async () => {
    const calls: string[] = [];
    const items = await remoteSearch(
      { service: 'sparql', endpoint: 'https://ex.org/sparql' },
      { text: 'Tw"ente', classIri: 'http://xmlns.com/foaf/0.1/Agent', lang: 'en' },
      fakeFetch({ results: { bindings: [
        { item: { type: 'uri', value: 'https://ex.org/ut' }, label: { type: 'literal', value: 'University of Twente' } },
        { item: { type: 'uri', value: 'https://ex.org/ut' }, label: { type: 'literal', value: 'UT' } },
      ] } }, calls),
    );
    expect(items).toEqual([{ iri: 'https://ex.org/ut', label: 'University of Twente', types: ['http://xmlns.com/foaf/0.1/Agent'], source: 'ex.org', sourceKind: 'remote' }]);
    const q = decodeURIComponent(calls[0].split('query=')[1]);
    expect(q).toContain('?item a <http://xmlns.com/foaf/0.1/Agent>');
    expect(q).toContain('LCASE("Tw\\"ente")');
    expect(sparqlQuery('', null)).not.toContain('CONTAINS');
  });

  it('searches OLS with an ontology filter', async () => {
    const calls: string[] = [];
    const items = await remoteSearch(
      { service: 'ols', filter: 'efo, chebi' },
      { text: 'ozone', classIri: null, lang: 'en' },
      fakeFetch({ response: { docs: [{ iri: 'http://purl.obolibrary.org/obo/CHEBI_25812', label: 'ozone', ontology_prefix: 'CHEBI' }] } }, calls),
    );
    expect(calls[0]).toBe('https://www.ebi.ac.uk/ols4/api/search?q=ozone&rows=20&ontology=efo%2Cchebi');
    expect(items[0]).toMatchObject({ label: 'ozone', source: 'OLS · CHEBI' });
  });

  it('searches Wikidata and filters by "instance of"', async () => {
    const calls: string[] = [];
    const body = (url: string) => url.includes('query.wikidata.org')
      ? { results: { bindings: [{ item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q1' } }] } }
      : { search: [
          { id: 'Q1', concepturi: 'http://www.wikidata.org/entity/Q1', display: { label: { value: 'University of Twente' } }, description: 'university' },
          { id: 'Q2', concepturi: 'http://www.wikidata.org/entity/Q2', label: 'Twente' },
        ] };
    const items = await remoteSearch({ service: 'wikidata', filter: 'Q3918' }, { text: 'twente', classIri: null, lang: 'nl-NL' }, fakeFetch(body, calls));
    expect(calls[0]).toContain('language=nl');
    expect(decodeURIComponent(calls[1])).toContain('wd:Q3918'.replace('wd:', 'http://www.wikidata.org/entity/'));
    expect(items.map((i) => i.label)).toEqual(['University of Twente']);
    expect(items[0].description).toBe('university');
  });

  it('skips too-short queries and reports unusable services', async () => {
    expect(await remoteSearch({ service: 'ols' }, { text: 'o', classIri: null, lang: 'en' }, fakeFetch({}))).toEqual([]);
    const failing: FetchLike = async () => { throw new TypeError('Failed to fetch'); };
    await expect(remoteSearch({ service: 'ols' }, { text: 'ozone', classIri: null, lang: 'en' }, failing)).rejects.toThrow(RemoteLookupError);
    await expect(remoteSearch({ service: 'ols' }, { text: 'ozone', classIri: null, lang: 'en' }, fakeFetch({}, [], 503))).rejects.toThrow('HTTP 503');
    await expect(remoteSearch({ service: 'sparql' }, { text: 'x', classIri: null, lang: 'en' }, fakeFetch({}))).rejects.toThrow('noEndpoint');
  });
});
