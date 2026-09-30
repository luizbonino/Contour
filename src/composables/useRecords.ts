// Local-only persistence for the Record tab: the record library (records of
// every schema, so they can be looked up from other forms), imported
// vocabulary files, and the base IRI for new records. Module-level state,
// autosaved to localStorage; degrades silently when storage is unavailable.
import { computed, ref, watch } from 'vue';
import type { MetadataRecord } from '../record';
import { DEFAULT_BASE_IRI, recordHasContent } from '../record';
import { parseRdf } from '../rdf';
import type { Quad } from '../rdf';
import {
  BUILTIN_SUBCLASSES,
  indexQuads,
  subclassPairs,
  superclassMap,
  type LookupItem,
} from '../lookup';

const RECORDS_KEY = 'contour.records';
const VOCABS_KEY = 'contour.vocabularies';
const BASE_KEY = 'contour.baseIri';
const CURRENT_KEY = 'contour.currentRecord';

export interface Vocabulary {
  id: string;
  name: string;
  text: string;
  syntax: string;
  addedAt: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // unavailable or over quota
  }
}

const records = ref<MetadataRecord[]>(read<MetadataRecord[]>(RECORDS_KEY, []));
const vocabularies = ref<Vocabulary[]>(read<Vocabulary[]>(VOCABS_KEY, []));
const baseIri = ref<string>(read<string>(BASE_KEY, DEFAULT_BASE_IRI));
// Last record opened per schema (shape IRI → record id).
const currentBySchema = ref<Record<string, string>>(read<Record<string, string>>(CURRENT_KEY, {}));
// Set when the vocabularies don't fit in localStorage (kept for this session only).
const vocabStorageFull = ref(false);

let saveTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  records,
  () => {
    if (saveTimer) clearTimeout(saveTimer);
    // Blank records (just opened, nothing entered) aren't worth keeping.
    saveTimer = setTimeout(() => write(RECORDS_KEY, records.value.filter((r) => recordHasContent(r.values))), 400);
  },
  { deep: true },
);
watch(vocabularies, (v) => { vocabStorageFull.value = !write(VOCABS_KEY, v); }, { deep: true });
watch(baseIri, (v) => write(BASE_KEY, v));
watch(currentBySchema, (v) => write(CURRENT_KEY, v), { deep: true });

// ── Lookup index ─────────────────────────────────────────────────────────────

const vocabCache = new Map<string, Quad[]>();
function vocabQuads(v: Vocabulary): Quad[] {
  let q = vocabCache.get(v.id);
  if (!q) {
    q = parseRdf(v.text, v.syntax).quads;
    vocabCache.set(v.id, q);
  }
  return q;
}

const recordCache = new Map<string, { nt: string; quads: Quad[] }>();
function recordQuads(r: MetadataRecord): Quad[] {
  const nt = r.ntriples || '';
  const hit = recordCache.get(r.id);
  if (hit && hit.nt === nt) return hit.quads;
  const quads = nt ? parseRdf(nt, 'ntriples').quads : [];
  recordCache.set(r.id, { nt, quads });
  return quads;
}

/** Everything lookups can offer, except the record being edited. */
export function useLookupIndex(excludeId: () => string | null, lang: () => string) {
  const items = computed<LookupItem[]>(() => {
    const out: LookupItem[] = [];
    for (const r of records.value) {
      if (r.id === excludeId()) continue;
      out.push(...indexQuads(recordQuads(r), r.schemaName || r.shapeIri, 'record', lang()));
    }
    for (const v of vocabularies.value) out.push(...indexQuads(vocabQuads(v), v.name, 'vocab', lang()));
    return out;
  });
  const pairs = computed<[string, string][]>(() => [
    ...BUILTIN_SUBCLASSES,
    ...vocabularies.value.flatMap((v) => subclassPairs(vocabQuads(v))),
  ]);
  const supers = computed(() => superclassMap(pairs.value));
  return { items, supers, pairs };
}

export function useRecords() {
  return { records, vocabularies, baseIri, currentBySchema, vocabStorageFull };
}
