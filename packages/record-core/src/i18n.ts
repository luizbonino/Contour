// Messages of the form renderer. The host app provides its own translate
// function under RECORD_I18N (same dotted keys); without one, the English
// defaults below are used. The package never touches storage.
import { inject, type InjectionKey } from 'vue';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface RecordI18n {
  t: Translate;
}

export const RECORD_I18N: InjectionKey<RecordI18n> = Symbol('record-core.i18n');

/** English defaults for every key the renderer uses. */
export const RECORD_MESSAGES_EN: Record<string, string> = {
  'formPreview.add': '+ Add',
  'formPreview.removeValue': 'Remove this value',
  'formPreview.maxReached': 'Maximum of {max} reached (sh:maxCount)',
  'formPreview.nestedSubform': '{iri} sub-form',
  'formPreview.nestedSubformGeneric': 'Nested sub-form',
  'formPreview.langTag': 'Language tag (e.g. en, pt-BR)',
  'fieldInput.select': '— select —',
  'fieldInput.search': 'Start typing to search…',
  'fieldInput.searchClass': 'Search {class} instances…',
  'lookup.noMatches': 'No matches — you can still enter an IRI.',
  'lookup.noneOfClass': 'No {class} found in your records or vocabularies — type an IRI, or import a vocabulary.',
  'lookup.none': 'Nothing to look up yet — type an IRI, or import a vocabulary.',
  'lookup.sourceRecord': 'record · {name}',
  'lookup.sourceIn': 'allowed value',
  'lookup.remoteSearching': 'Searching {service}…',
  'lookup.remoteMinChars': 'Type at least {n} characters to search {service}.',
  'lookup.remoteHttp': '{service} answered with an error (HTTP {status}).',
  'lookup.remote.unreachable': 'Couldn’t reach {service} — you may be offline, or it doesn’t allow browser access (CORS).',
  'lookup.remote.badResponse': '{service} sent an unexpected response.',
  'lookup.remote.noEndpoint': 'No SPARQL endpoint is set for this field.',
};

function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

/** English fallback translator. */
export const translateEn: Translate = (key, params) => interpolate(RECORD_MESSAGES_EN[key] ?? key, params);

/** The renderer's translate function: the host's, or the English defaults. */
export function useRecordI18n(): RecordI18n {
  return inject(RECORD_I18N, { t: translateEn });
}
