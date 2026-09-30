<script setup lang="ts">
// Record tab — the "light FDP": fill in the form generated from the schema and
// get the metadata record as RDF. Records live in a local library (every
// schema), which also feeds the lookup fields together with imported
// vocabularies.
import { computed, nextTick, provide, ref, watch } from 'vue';
import type { Field, Schema } from '../types';
import {
  expandTerm,
  importRecords,
  mintSubject,
  newEntryFor,
  normalizeRecord,
  recordHasContent,
  recordTitle,
  recordToQuads,
  serializeGraph,
  shortId,
  slugify,
  validateRecord,
  type MetadataRecord,
  type RecordIssue,
} from '../record';
import { OUTPUT_SYNTAXES, RDF_FILE_ACCEPT, SYNTAX_BY_ID, DEFAULT_SYNTAX, detectSyntax, parseRdf, serializeQuads } from '../rdf';
import { indexQuads, searchLookup, type LookupItem } from '../lookup';
import { remoteSearch } from '../remote';
import { checkRecordShacl, type ShaclFinding } from '../shaclCheck';
import { DataFactory } from '../rdf';
import { newId } from '../data';
import { useRecords, useLookupIndex } from '../composables/useRecords';
import { FILL_CONTEXT } from '../composables/useFillContext';
import { useI18n } from '../composables/useI18n';
import FormPreview from './FormPreview.vue';
import Icon from './Icon.vue';

const props = defineProps<{ schema: Schema }>();
const { t, plural, locale } = useI18n();
const { records, vocabularies, baseIri, currentBySchema, vocabStorageFull } = useRecords();

const hasFields = computed(() => props.schema.groups.some((g) => g.fields.length > 0));
const targetClassIri = computed(() =>
  props.schema.targetClass ? expandTerm(props.schema.targetClass, props.schema.prefixes) : null,
);
const shapeKey = computed(() => props.schema.shapeIri || ':Shape');

// ── Current record ───────────────────────────────────────────────────────────

const schemaRecords = computed(() => records.value.filter((r) => r.shapeIri === shapeKey.value));
const currentId = computed(() => currentBySchema.value[shapeKey.value] ?? null);
const current = computed<MetadataRecord | null>(
  () => schemaRecords.value.find((r) => r.id === currentId.value) ?? null,
);

function select(id: string) {
  currentBySchema.value[shapeKey.value] = id;
}

function autoSubject(title: string): string {
  return mintSubject(baseIri.value, targetClassIri.value || '', slugify(title) || shortId());
}

function createRecord(): MetadataRecord {
  const r: MetadataRecord = {
    id: newId('rec'),
    shapeIri: shapeKey.value,
    schemaName: props.schema.schemaName,
    targetClass: targetClassIri.value || '',
    subject: autoSubject(''),
    subjectAuto: true,
    values: normalizeRecord(props.schema, {}),
    updatedAt: Date.now(),
  };
  records.value.push(r);
  select(r.id);
  return records.value[records.value.length - 1];
}

// Always have a record to fill in for the schema on screen.
watch(
  shapeKey,
  () => {
    if (current.value) return;
    const latest = schemaRecords.value.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest) select(latest.id);
    else createRecord();
  },
  { immediate: true },
);

// Schema edits (new fields, higher min counts) → seed the missing entries.
watch(
  () => [props.schema, current.value?.id],
  () => {
    const r = current.value;
    if (!r) return;
    normalizeRecord(props.schema, r.values);
    r.schemaName = props.schema.schemaName;
    r.targetClass = targetClassIri.value || '';
  },
  { deep: true, immediate: true },
);

const title = computed(() => (current.value ? recordTitle(props.schema, current.value.values) : ''));

// The subject follows the title (and base IRI) until edited by hand.
watch([title, baseIri, targetClassIri], ([tt]) => {
  const r = current.value;
  if (r?.subjectAuto && tt) r.subject = autoSubject(tt);
});

function onSubjectInput(e: Event) {
  if (!current.value) return;
  current.value.subject = (e.target as HTMLInputElement).value.trim();
  current.value.subjectAuto = false;
}

function regenerateSubject() {
  if (!current.value) return;
  current.value.subjectAuto = true;
  current.value.subject = autoSubject(title.value);
}

function recordLabel(r: MetadataRecord): string {
  return r.label || r.subject || t('record.untitled');
}

// ── RDF output ───────────────────────────────────────────────────────────────

const syntax = ref<string>(DEFAULT_SYNTAX);
const quads = computed(() =>
  current.value ? recordToQuads(props.schema, current.value.subject, current.value.values) : [],
);
const output = computed(() => serializeGraph(quads.value, props.schema.prefixes, syntax.value));

// Cache the triples + label on the record: other forms look it up from these,
// even when this schema isn't loaded.
function cacheRecord(r: MetadataRecord) {
  r.ntriples = serializeQuads(recordToQuads(props.schema, r.subject, r.values), [], 'ntriples');
  r.label = recordTitle(props.schema, r.values);
  r.updatedAt = Date.now();
}
watch(quads, () => { if (current.value) cacheRecord(current.value); }, { immediate: true });

const copied = ref(false);
async function copyOutput() {
  try {
    await navigator.clipboard.writeText(output.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard may be unavailable */
  }
}

function download(text: string, base: string) {
  const s = SYNTAX_BY_ID[syntax.value] || SYNTAX_BY_ID[DEFAULT_SYNTAX];
  const blob = new Blob([text], { type: s.format });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}.${s.ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCurrent() {
  download(output.value, slugify(title.value) || 'record');
}

function downloadAll() {
  const all = schemaRecords.value.flatMap((r) => recordToQuads(props.schema, r.subject, r.values));
  download(serializeGraph(all, props.schema.prefixes, syntax.value), slugify(props.schema.schemaName || 'records') || 'records');
}

// ── Records list actions ─────────────────────────────────────────────────────

function newRecord() {
  createRecord();
}

function duplicateRecord() {
  const r = current.value;
  if (!r) return;
  const copy: MetadataRecord = {
    ...JSON.parse(JSON.stringify(r)),
    id: newId('rec'),
    subject: mintSubject(baseIri.value, targetClassIri.value || '', `${slugify(title.value) || 'record'}-${shortId().slice(0, 4)}`),
    subjectAuto: false,
    updatedAt: Date.now(),
  };
  records.value.push(copy);
  select(copy.id);
}

function deleteRecord() {
  const r = current.value;
  if (!r || !window.confirm(t('record.deleteConfirm', { name: recordLabel(r) }))) return;
  records.value = records.value.filter((x) => x.id !== r.id);
  const next = schemaRecords.value[0];
  if (next) select(next.id);
  else createRecord();
}

// ── Import ───────────────────────────────────────────────────────────────────

const notice = ref<{ kind: 'ok' | 'error'; text: string } | null>(null);
const recordFileRef = ref<HTMLInputElement | null>(null);
const vocabFileRef = ref<HTMLInputElement | null>(null);

function readFile(e: Event): Promise<{ name: string; text: string } | null> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return Promise.resolve(null);
  return file.text().then((text) => ({ name: file.name, text }));
}

// The JSON-LD reader signals remote (URL) contexts with a code.
function jsonLdErrorText(error: string): string {
  return error === 'remoteContext' ? t('record.remoteContext') : error;
}

async function onRecordFile(e: Event) {
  const f = await readFile(e);
  if (!f) return;
  const syn = detectSyntax(f.name);
  const prev = current.value;
  const res = importRecords(f.text, syn, props.schema);
  if (res.error) {
    const msg =
      res.error === 'noRecords' ? t('record.noRecords', { class: props.schema.targetClass })
      : res.error === 'noTargetClass' ? t('record.noTargetClass')
      : jsonLdErrorText(res.error);
    notice.value = { kind: 'error', text: t('record.importError', { error: msg }) };
    return;
  }
  const clashes = res.records.filter((ir) => schemaRecords.value.some((r) => r.subject === ir.subject));
  if (clashes.length && !window.confirm(t('record.replaceConfirm', { n: clashes.length }))) return;
  let lastId = '';
  for (const ir of res.records) {
    const existing = ir.subject ? schemaRecords.value.find((r) => r.subject === ir.subject) : undefined;
    if (existing) {
      existing.values = ir.values;
      cacheRecord(existing);
      lastId = existing.id;
      continue;
    }
    const r: MetadataRecord = {
      id: newId('rec'),
      shapeIri: shapeKey.value,
      schemaName: props.schema.schemaName,
      targetClass: targetClassIri.value || '',
      subject: ir.subject || autoSubject(recordTitle(props.schema, ir.values)),
      subjectAuto: !ir.subject,
      values: ir.values,
      updatedAt: Date.now(),
    };
    cacheRecord(r);
    records.value.push(r);
    lastId = r.id;
  }
  // The blank starter record the import supersedes isn't worth keeping around.
  if (prev && prev.id !== lastId && !recordHasContent(prev.values)) {
    records.value = records.value.filter((r) => r.id !== prev.id);
  }
  if (lastId) select(lastId);
  const parts = [plural('record.imported', res.records.length)];
  if (res.unmapped) parts.push(plural('record.unmapped', res.unmapped));
  notice.value = { kind: 'ok', text: parts.join(' ') };
}

async function onVocabFile(e: Event) {
  const f = await readFile(e);
  if (!f) return;
  const syn = detectSyntax(f.name);
  const parsed = parseRdf(f.text, syn);
  if (parsed.error) {
    notice.value = { kind: 'error', text: t('record.sources.error', { name: f.name, error: jsonLdErrorText(parsed.error) }) };
    return;
  }
  const n = indexQuads(parsed.quads, f.name, 'vocab').length;
  vocabularies.value = [
    ...vocabularies.value.filter((v) => v.name !== f.name),
    { id: newId('voc'), name: f.name, text: f.text, syntax: syn, addedAt: Date.now() },
  ];
  notice.value = { kind: 'ok', text: t('record.sources.added', { name: f.name, terms: plural('count.terms', n) }) };
}

function removeVocab(id: string) {
  vocabularies.value = vocabularies.value.filter((v) => v.id !== id);
}

const vocabTermCounts = computed(() =>
  Object.fromEntries(vocabularies.value.map((v) => [v.id, indexQuads(parseRdf(v.text, v.syntax).quads, v.name, 'vocab').length])),
);
const otherRecordCount = computed(() => records.value.filter((r) => r.id !== currentId.value && r.ntriples).length);

// ── Lookups ──────────────────────────────────────────────────────────────────

const { items: lookupItems, supers, pairs } = useLookupIndex(() => currentId.value, () => locale.value);

function inItems(field: Field): LookupItem[] {
  return (field.inValues || [])
    .filter((iv) => iv.kind === 'iri')
    .map((iv) => ({ iri: expandTerm(iv.value, props.schema.prefixes) || iv.value, label: iv.value, types: [], source: 'sh:in', sourceKind: 'in' as const }));
}

function search(field: Field, text: string): LookupItem[] {
  const classIri = field.class ? expandTerm(field.class, props.schema.prefixes) : null;
  return searchLookup([...inItems(field), ...lookupItems.value], { classIri, text }, supers.value);
}

// Items seen from remote services this session, so a chosen one keeps its label.
const remoteSeen = new Map<string, LookupItem>();

function remote(field: Field, text: string, signal: AbortSignal): Promise<LookupItem[]> | null {
  if (!field.lookup) return null;
  const classIri = field.class ? expandTerm(field.class, props.schema.prefixes) : null;
  return remoteSearch(field.lookup, { text, classIri, lang: locale.value }, undefined, signal).then((items) => {
    for (const it of items) remoteSeen.set(it.iri, it);
    return items;
  });
}

function describe(field: Field, value: string): LookupItem | undefined {
  const iri = expandTerm(value, props.schema.prefixes);
  if (!iri) return undefined;
  return [...inItems(field), ...lookupItems.value].find((it) => it.iri === iri) ?? remoteSeen.get(iri);
}

// ── Validation ───────────────────────────────────────────────────────────────

const issues = computed<RecordIssue[]>(() => {
  const r = current.value;
  if (!r) return [];
  const others = records.value.filter((x) => x.id !== r.id).map((x) => x.subject);
  return validateRecord(props.schema, r.subject, r.values, others);
});
const errorCount = computed(() => issues.value.filter((i) => i.severity === 'error').length);
const warningCount = computed(() => issues.value.length - errorCount.value);
const subjectIssue = computed(() => issues.value.find((i) => i.loc === ''));

// ── Full SHACL (Core) check ────────────────────────────────────────────────
// Runs the whole schema — including the "Preserved" constructs — through a real
// SHACL engine. Linked resources' types (from records, vocabularies and remote
// results) and subclass links are added so sh:class can be checked.
const fullCheck = ref(false);
const shaclState = ref<'idle' | 'running' | 'done' | 'error'>('idle');
const shaclConforms = ref(true);
const shaclFindings = ref<ShaclFinding[]>([]);
const shaclError = ref('');
let shaclTimer: ReturnType<typeof setTimeout> | null = null;
let shaclRun = 0;

function contextQuads() {
  const { namedNode, quad } = DataFactory;
  const known = new Map<string, LookupItem>();
  for (const it of [...lookupItems.value, ...remoteSeen.values()]) if (it.types.length && !known.has(it.iri)) known.set(it.iri, it);
  const linked = new Set(quads.value.filter((q) => q.object.termType === 'NamedNode').map((q) => q.object.value));
  const out = [];
  for (const iri of linked) {
    for (const ty of known.get(iri)?.types || []) {
      out.push(quad(namedNode(iri), namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), namedNode(ty)));
    }
  }
  for (const [sub, sup] of pairs.value) {
    out.push(quad(namedNode(sub), namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), namedNode(sup)));
  }
  return out;
}

async function runShacl() {
  const r = current.value;
  if (!r) return;
  const run = ++shaclRun;
  shaclState.value = 'running';
  try {
    const res = await checkRecordShacl(props.schema, r.subject, r.values, contextQuads());
    if (run !== shaclRun) return;
    shaclConforms.value = res.conforms;
    shaclFindings.value = res.findings;
    shaclState.value = 'done';
  } catch (e) {
    if (run !== shaclRun) return;
    shaclError.value = e instanceof Error ? e.message : String(e);
    shaclState.value = 'error';
  }
}

watch([fullCheck, quads, () => props.schema], () => {
  if (!fullCheck.value) return;
  if (shaclTimer) clearTimeout(shaclTimer);
  shaclTimer = setTimeout(runShacl, 400);
}, { deep: true });

function findingText(f: ShaclFinding): string {
  if (f.message) return f.message;
  const key = `record.shacl.component.${f.component}`;
  const txt = t(key, { value: f.value ?? '' });
  if (txt !== key) return txt;
  return f.engineMessage || t('record.shacl.generic', { component: f.component });
}

function focusFinding(f: ShaclFinding) {
  if (f.loc !== null) focusIssue({ loc: f.loc, severity: f.severity, code: f.component, fieldName: f.fieldName });
}

function issueText(i: RecordIssue): string {
  return i.message || t(`record.issue.${i.code}`, i.params);
}

async function focusIssue(i: RecordIssue) {
  await nextTick();
  const row = document.querySelector<HTMLElement>(i.loc ? `.record-form [data-loc="${CSS.escape(i.loc)}"]` : '.record-subject input');
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const inputs = row.querySelectorAll<HTMLElement>('input, select, textarea');
  (inputs[i.index ?? 0] || inputs[0])?.focus({ preventScroll: true });
}

provide(FILL_CONTEXT, {
  search,
  remote,
  describe,
  issuesAt: (loc) => issues.value.filter((i) => i.loc === loc),
  issueText,
  newEntry: (field) => newEntryFor(props.schema, field),
});
</script>

<template>
  <div class="record-tab">
    <div class="tabs-callout" v-html="t('record.calloutHtml')" />

    <div v-if="!hasFields" class="record-empty">{{ t('record.noFields') }}</div>

    <template v-else-if="current">
      <p v-if="!targetClassIri" class="residual-notice">
        <Icon name="warning" :size="13" /> {{ t('record.noTargetClassHint') }}
      </p>
      <p v-if="notice" class="record-notice" :class="`is-${notice.kind}`">
        <Icon :name="notice.kind === 'ok' ? 'check' : 'warning'" :size="13" />
        <span>{{ notice.text }}</span>
        <button class="btn btn-ghost btn-xs" @click="notice = null">{{ t('draft.dismiss') }}</button>
      </p>

      <div class="record-bar">
        <label class="record-bar__select">
          <span>{{ t('record.record') }}</span>
          <select :value="current.id" @change="select(($event.target as HTMLSelectElement).value)">
            <option v-for="r in schemaRecords" :key="r.id" :value="r.id">{{ recordLabel(r) }}</option>
          </select>
        </label>
        <div class="record-bar__actions">
          <button class="btn btn-ghost btn-sm" @click="newRecord"><Icon name="plus" :size="13" /> {{ t('common.new') }}</button>
          <button class="btn btn-ghost btn-sm" @click="duplicateRecord"><Icon name="duplicate" :size="13" /> {{ t('fieldCard.duplicate') }}</button>
          <button class="btn btn-ghost btn-sm" :title="t('record.importTitle')" @click="recordFileRef?.click()">
            <Icon name="folder" :size="13" /> {{ t('record.import') }}
          </button>
          <button class="btn btn-danger-ghost btn-sm" @click="deleteRecord"><Icon name="trash" :size="13" /> {{ t('fieldCard.delete') }}</button>
          <input ref="recordFileRef" type="file" :accept="RDF_FILE_ACCEPT" style="display: none" @change="onRecordFile" />
        </div>
        <div class="record-subject form-row">
          <label>{{ t('record.subject') }}</label>
          <div class="record-subject__row">
            <input
              type="text"
              class="mono"
              :class="{ 'is-invalid': subjectIssue?.severity === 'error' }"
              :value="current.subject"
              @input="onSubjectInput"
            />
            <button class="btn btn-ghost btn-sm" :title="t('record.regenerateTitle')" @click="regenerateSubject">
              <Icon name="redo" :size="13" /> {{ t('record.regenerate') }}
            </button>
          </div>
          <p v-if="subjectIssue" class="record-issue" :class="`is-${subjectIssue.severity}`">{{ issueText(subjectIssue) }}</p>
          <p v-else class="record-hint">{{ current.subjectAuto ? t('record.subjectAutoHint') : t('record.subjectManualHint') }}</p>
        </div>
        <div class="record-base form-row">
          <label>{{ t('record.baseIri') }}</label>
          <input v-model.trim="baseIri" type="text" class="mono" />
        </div>
      </div>

      <div class="record-grid">
        <div class="preview-pane record-form">
          <div class="preview-pane__header">
            <div class="preview-pane__title">{{ t('record.form') }}</div>
            <div style="font-size: 12px; color: var(--color-text-lighter)">
              {{ t('formPreviewTab.target') }}
              <span style="font-family: var(--font-mono)">{{ schema.targetClass }}</span>
            </div>
          </div>
          <FormPreview :key="current.id" :schema="schema" :node="current.values" />
        </div>

        <div class="record-side">
          <div class="preview-pane">
            <div class="preview-pane__header">
              <div class="preview-pane__title">{{ t('record.validation') }}</div>
              <span
                class="record-status"
                :class="errorCount ? 'is-error' : warningCount ? 'is-warning' : 'is-ok'"
              >
                <Icon :name="issues.length ? 'warning' : 'check'" :size="12" />
                {{ issues.length ? t('issues.summary', { errors: errorCount, warnings: warningCount }) : t('issues.ok') }}
              </span>
            </div>
            <div class="record-issues">
              <p v-if="!issues.length" class="record-issues__ok">{{ t('record.valid') }}</p>
              <button
                v-for="(iss, i) in issues"
                :key="i"
                class="issues-panel__item"
                :class="`is-${iss.severity === 'error' ? 'error' : 'warning'}`"
                @click="focusIssue(iss)"
              >
                <Icon :name="iss.severity === 'error' ? 'warning' : 'info'" :size="13" />
                <span><strong v-if="iss.fieldName">{{ iss.fieldName }}:</strong> {{ issueText(iss) }}</span>
              </button>
              <p class="record-hint">{{ t('record.validationScope') }}</p>
              <div class="record-shacl">
                <label class="record-shacl__toggle">
                  <input v-model="fullCheck" type="checkbox" />
                  {{ t('record.shacl.toggle') }}
                </label>
                <template v-if="fullCheck">
                  <p v-if="shaclState === 'running' && !shaclFindings.length" class="record-hint">{{ t('record.shacl.running') }}</p>
                  <p v-else-if="shaclState === 'error'" class="record-issue is-error">{{ t('record.shacl.error', { error: shaclError }) }}</p>
                  <template v-else-if="shaclState === 'done' || shaclFindings.length">
                    <p v-if="shaclConforms && !shaclFindings.length" class="record-issues__ok">{{ t('record.shacl.conforms') }}</p>
                    <button
                      v-for="(f, i) in shaclFindings"
                      :key="`s${i}`"
                      class="issues-panel__item"
                      :class="`is-${f.severity === 'error' ? 'error' : 'warning'}`"
                      :disabled="f.loc === null"
                      @click="focusFinding(f)"
                    >
                      <Icon :name="f.severity === 'error' ? 'warning' : 'info'" :size="13" />
                      <span>
                        <strong v-if="f.fieldName">{{ f.fieldName }}:</strong> {{ findingText(f) }}
                        <code class="record-shacl__comp">sh:{{ f.component }}</code>
                      </span>
                    </button>
                  </template>
                  <p class="record-hint">{{ t('record.shacl.scope') }}</p>
                </template>
              </div>
            </div>
          </div>

          <div class="preview-pane">
            <div class="preview-pane__header">
              <div class="preview-pane__title">{{ t('record.output') }}</div>
              <label class="syntax-select">
                {{ t('definition.syntax') }}
                <select v-model="syntax">
                  <option v-for="s in OUTPUT_SYNTAXES" :key="s.id" :value="s.id">{{ s.label }}</option>
                </select>
              </label>
            </div>
            <pre class="shacl-output record-output">{{ output }}</pre>
            <div class="record-output__actions">
              <button class="btn btn-ghost btn-sm" @click="copyOutput">
                <Icon :name="copied ? 'check' : 'duplicate'" :size="13" /> {{ copied ? t('record.copied') : t('common.copy') }}
              </button>
              <button
                v-if="schemaRecords.length > 1"
                class="btn btn-secondary btn-sm"
                :title="t('record.downloadAllTitle')"
                @click="downloadAll"
              >
                {{ t('record.downloadAll', { n: schemaRecords.length }) }}
              </button>
              <button class="btn btn-primary btn-sm" @click="downloadCurrent">{{ t('record.download') }}</button>
            </div>
          </div>

          <div class="preview-pane">
            <div class="preview-pane__header">
              <div class="preview-pane__title">{{ t('record.sources.title') }}</div>
              <button class="btn btn-ghost btn-xs" :title="t('record.sources.formats')" @click="vocabFileRef?.click()">
                <Icon name="plus" :size="12" /> {{ t('record.sources.import') }}
              </button>
              <input ref="vocabFileRef" type="file" :accept="RDF_FILE_ACCEPT" style="display: none" @change="onVocabFile" />
            </div>
            <div class="record-sources">
              <p class="record-hint">{{ t('record.sources.hint') }}</p>
              <div class="record-sources__item">
                <Icon name="document" :size="13" />
                <span>{{ plural('record.sources.records', otherRecordCount) }}</span>
              </div>
              <div v-for="v in vocabularies" :key="v.id" class="record-sources__item">
                <Icon name="layers" :size="13" />
                <span class="record-sources__name">{{ v.name }}</span>
                <span class="record-sources__count">{{ plural('count.terms', vocabTermCounts[v.id] || 0) }}</span>
                <button class="btn btn-ghost btn-xs" :title="t('prefixes.remove')" @click="removeVocab(v.id)">
                  <Icon name="x" :size="12" />
                </button>
              </div>
              <p v-if="vocabStorageFull" class="record-issue is-warning">{{ t('record.sources.storageFull') }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
