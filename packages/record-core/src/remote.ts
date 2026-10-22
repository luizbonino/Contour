// Remote lookup sources for AutoComplete / Instances-select fields in the
// Record tab: any SPARQL endpoint, the EBI Ontology Lookup Service (OLS4) and
// Wikidata. Requests go straight from the browser, so a service must allow
// cross-origin (CORS) access — verified for OLS4 and Wikidata (API + SPARQL).
import type { LookupConfig, LookupService } from './types';
import type { LookupItem } from './lookup';

export const OLS_DEFAULT = 'https://www.ebi.ac.uk/ols4';
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
export const MIN_REMOTE_CHARS = 2;
const LIMIT = 20;

export const SERVICE_LABELS: Record<LookupService, string> = {
  sparql: 'SPARQL',
  ols: 'OLS',
  wikidata: 'Wikidata',
};

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface RemoteQuery {
  text: string;
  classIri: string | null;
  lang: string;
}

/** Escape text for a SPARQL string literal. */
function sparqlString(s: string): string {
  return '"' + s.replace(/[\\"]/g, (c) => '\\' + c).replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
}

/** Label search, optionally restricted to instances of a class. */
export function sparqlQuery(text: string, classIri: string | null, limit = LIMIT): string {
  const filter = text.trim()
    ? `  FILTER(CONTAINS(LCASE(STR(?label)), LCASE(${sparqlString(text.trim())})))\n`
    : '';
  return (
    'SELECT DISTINCT ?item ?label WHERE {\n' +
    (classIri ? `  ?item a <${classIri}> .\n` : '') +
    '  ?item <http://www.w3.org/2000/01/rdf-schema#label>|<http://www.w3.org/2004/02/skos/core#prefLabel>|' +
    '<http://purl.org/dc/terms/title>|<http://xmlns.com/foaf/0.1/name>|<http://schema.org/name> ?label .\n' +
    '  FILTER(isIRI(?item))\n' +
    filter +
    `} LIMIT ${limit}`
  );
}

interface SparqlJson {
  results?: { bindings?: Array<Record<string, { type: string; value: string; 'xml:lang'?: string }>> };
}

export function parseSparqlResults(json: unknown, source: string, classIri: string | null): LookupItem[] {
  const rows = (json as SparqlJson)?.results?.bindings || [];
  const out: LookupItem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const iri = r.item?.type === 'uri' ? r.item.value : '';
    if (!iri || seen.has(iri)) continue;
    seen.add(iri);
    out.push({ iri, label: r.label?.value || '', types: classIri ? [classIri] : [], source, sourceKind: 'remote' });
  }
  return out;
}

interface OlsJson {
  response?: { docs?: Array<{ iri?: string; label?: string; ontology_prefix?: string; ontology_name?: string }> };
}

export function parseOls(json: unknown): LookupItem[] {
  const docs = (json as OlsJson)?.response?.docs || [];
  const out: LookupItem[] = [];
  const seen = new Set<string>();
  for (const d of docs) {
    if (!d.iri || seen.has(d.iri)) continue;
    seen.add(d.iri);
    const onto = d.ontology_prefix || d.ontology_name || '';
    out.push({ iri: d.iri, label: d.label || '', types: [], source: onto ? `OLS · ${onto}` : 'OLS', sourceKind: 'remote' });
  }
  return out;
}

interface WikidataJson {
  search?: Array<{ id?: string; concepturi?: string; label?: string; description?: string; display?: { label?: { value?: string } } }>;
}

export function parseWikidata(json: unknown): LookupItem[] {
  return ((json as WikidataJson)?.search || [])
    .filter((e) => e.concepturi)
    .map((e) => ({
      iri: e.concepturi!,
      label: e.display?.label?.value || e.label || e.id || '',
      description: e.description,
      types: [],
      source: 'Wikidata',
      sourceKind: 'remote' as const,
    }));
}

export class RemoteLookupError extends Error {}

async function getJson(fetchImpl: FetchLike, url: string, accept: string, signal?: AbortSignal): Promise<unknown> {
  let res;
  try {
    res = await fetchImpl(url, { headers: { Accept: accept }, signal });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    // A CORS refusal and being offline look the same from the page.
    throw new RemoteLookupError('unreachable');
  }
  if (!res.ok) throw new RemoteLookupError(`HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new RemoteLookupError('badResponse');
  }
}

/** Keep only Wikidata items that are (subclass-)instances of `qid`. */
async function wikidataInstancesOf(items: LookupItem[], qid: string, fetchImpl: FetchLike, signal?: AbortSignal): Promise<LookupItem[]> {
  if (!items.length) return items;
  const values = items.map((i) => `<${i.iri}>`).join(' ');
  const q = `SELECT ?item WHERE { VALUES ?item { ${values} } ?item <http://www.wikidata.org/prop/direct/P31>/<http://www.wikidata.org/prop/direct/P279>* <http://www.wikidata.org/entity/${qid}> . }`;
  const json = await getJson(fetchImpl, `${WIKIDATA_SPARQL}?query=${encodeURIComponent(q)}`, 'application/sparql-results+json', signal);
  const keep = new Set(((json as SparqlJson)?.results?.bindings || []).map((r) => r.item?.value));
  return items.filter((i) => keep.has(i.iri));
}

/** Search a remote source. Throws RemoteLookupError when the service can't be used. */
export async function remoteSearch(
  cfg: LookupConfig,
  q: RemoteQuery,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  signal?: AbortSignal,
): Promise<LookupItem[]> {
  const text = q.text.trim();
  if (cfg.service === 'sparql') {
    if (!cfg.endpoint) throw new RemoteLookupError('noEndpoint');
    const sep = cfg.endpoint.includes('?') ? '&' : '?';
    const url = `${cfg.endpoint}${sep}query=${encodeURIComponent(sparqlQuery(text, q.classIri))}`;
    const json = await getJson(fetchImpl, url, 'application/sparql-results+json', signal);
    let host = cfg.endpoint;
    try { host = new URL(cfg.endpoint).host; } catch { /* keep as is */ }
    return parseSparqlResults(json, host, q.classIri);
  }
  if (text.length < MIN_REMOTE_CHARS) return [];
  if (cfg.service === 'ols') {
    const base = (cfg.endpoint || OLS_DEFAULT).replace(/\/+$/, '');
    const onto = (cfg.filter || '').split(/[\s,]+/).filter(Boolean).join(',');
    const url = `${base}/api/search?q=${encodeURIComponent(text)}&rows=${LIMIT}${onto ? `&ontology=${encodeURIComponent(onto)}` : ''}`;
    return parseOls(await getJson(fetchImpl, url, 'application/json', signal));
  }
  const lang = (q.lang || 'en').split('-')[0];
  const url = `${WIKIDATA_API}?action=wbsearchentities&format=json&origin=*&type=item&limit=${LIMIT}` +
    `&language=${lang}&uselang=${lang}&search=${encodeURIComponent(text)}`;
  const items = parseWikidata(await getJson(fetchImpl, url, 'application/json', signal));
  const qid = (cfg.filter || '').trim();
  return /^Q\d+$/.test(qid) ? wikidataInstancesOf(items, qid, fetchImpl, signal) : items;
}
