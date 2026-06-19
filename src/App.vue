<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSchemaStore } from './composables/useSchema';
import { generateShacl, highlightTurtle, parseShacl } from './shacl';
import { WIDGET_BY_ID } from './data';
import type { SelectedKind } from './types';
import Icon from './components/Icon.vue';
import Palette from './components/Palette.vue';
import Canvas from './components/Canvas.vue';
import Inspector from './components/Inspector.vue';
import FormPreview from './components/FormPreview.vue';
import contourIcon from './assets/contour-icon.svg';
import { useI18n } from './composables/useI18n';
import { LOCALES } from './i18n';

const { schema, mutate } = useSchemaStore();
const { t, plural, locale, setLocale } = useI18n();

// Keep the browser-tab title in sync with the schema being edited and the locale.
watch(
  [() => schema.schemaName, locale],
  ([name]) => {
    const display = name || t('page.defaultSchemaName');
    document.title = `${t('page.edit', { name: display })} · Contour`;
  },
  { immediate: true },
);

type Tab = 'definition' | 'visual' | 'preview';
const tab = ref<Tab>('visual');

const selectedKind = ref<SelectedKind>('schema');
const selectedId = ref<string | null>(null);
const selectedNestedShapeId = ref<string | null>(null);

type PreviewMode = 'shacl' | 'form';
const previewMode = ref<PreviewMode>('shacl');
const showShaclPreview = ref(true);

const shacl = computed(() => generateShacl(schema));
const shaclHtml = computed(() => highlightTurtle(shacl.value));

const shaclDraft = ref(shacl.value);
const shaclParseError = ref<string | null>(null);
let userEditingShacl = false;
let shaclEditTimeout: ReturnType<typeof setTimeout> | null = null;
let shaclParseTimeout: ReturnType<typeof setTimeout> | null = null;

watch(shacl, (newShacl) => {
  if (!userEditingShacl) {
    shaclDraft.value = newShacl;
    shaclParseError.value = null;
  }
});

function onShaclDraftInput(e: Event) {
  const ta = e.target as HTMLTextAreaElement;
  const text = ta.value;
  shaclDraft.value = text;
  userEditingShacl = true;
  if (shaclEditTimeout) clearTimeout(shaclEditTimeout);
  shaclEditTimeout = setTimeout(() => { userEditingShacl = false; }, 3000);
  if (shaclParseTimeout) clearTimeout(shaclParseTimeout);
  shaclParseTimeout = setTimeout(() => {
    const result = parseShacl(text);
    if (result.schema) {
      shaclParseError.value = null;
      mutate((d) => {
        const desc = d.schemaDescription;
        Object.assign(d, result.schema!);
        d.schemaDescription = desc;
      });
    } else {
      const line = result.errorLine ? ` (line ${result.errorLine})` : '';
      shaclParseError.value = `${result.error}${line}`;
    }
  }, 800);
  updateAc(ta);
}

// ── Autocomplete ─────────────────────────────────────────────────────────────

const AC_PREDS = [
  'sh:path', 'sh:name', 'sh:description', 'sh:nodeKind', 'sh:datatype', 'sh:class',
  'sh:minCount', 'sh:maxCount', 'sh:minLength', 'sh:maxLength', 'sh:pattern',
  'sh:defaultValue', 'sh:in', 'sh:order', 'sh:group', 'sh:property', 'sh:targetClass',
  'dash:editor', 'rdfs:label', 'rdfs:comment',
];
const AC_NODE_KINDS = [
  'sh:IRI', 'sh:Literal', 'sh:BlankNode',
  'sh:BlankNodeOrIRI', 'sh:BlankNodeOrLiteral', 'sh:IRIOrLiteral',
];
const AC_XSD = [
  'xsd:string', 'xsd:integer', 'xsd:decimal', 'xsd:float',
  'xsd:double', 'xsd:boolean', 'xsd:date', 'xsd:dateTime', 'xsd:anyURI',
];
const AC_TYPES = ['sh:NodeShape', 'sh:PropertyGroup'];
const AC_DASH = Object.values(WIDGET_BY_ID).map((w) => w.editor);
const AC_ALL = [...AC_PREDS, ...AC_NODE_KINDS, ...AC_XSD, ...AC_DASH, ...AC_TYPES, '@prefix'];

// Canonical namespace URIs for each static prefix alias used in completion lists.
const STATIC_PREFIX_URIS: Record<string, string> = {
  sh:   'http://www.w3.org/ns/shacl#',
  dash: 'http://datashapes.org/dash#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  rdf:  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  xsd:  'http://www.w3.org/2001/XMLSchema#',
};

// Reverse: canonical URI → static alias
const URI_TO_STATIC: Record<string, string> = Object.fromEntries(
  Object.entries(STATIC_PREFIX_URIS).map(([alias, uri]) => [uri, alias]),
);

function parsePrefixMaps(text: string): {
  aliasToUri: Record<string, string>;
  uriToAlias: Record<string, string>;
} {
  const aliasToUri: Record<string, string> = {};
  const uriToAlias: Record<string, string> = {};
  const re = /@prefix\s+([\w-]*):\s*<([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    aliasToUri[m[1]] = m[2];
    uriToAlias[m[2]] = m[1];
  }
  return { aliasToUri, uriToAlias };
}

// Remap a static completion (e.g. "sh:path") using the user's declared prefix alias.
function remapCompletion(term: string, uriToAlias: Record<string, string>): string {
  const c = term.indexOf(':');
  if (c < 0) return term;
  const staticAlias = term.slice(0, c);
  const local = term.slice(c + 1);
  const uri = STATIC_PREFIX_URIS[staticAlias];
  if (!uri) return term;
  const userAlias = uriToAlias[uri];
  return userAlias !== undefined ? `${userAlias}:${local}` : term;
}

// Normalize a token typed by the user (e.g. "shacl:path") back to its static alias
// (e.g. "sh:path") so context comparisons always work.
function normalizeToken(term: string, aliasToUri: Record<string, string>): string {
  const c = term.indexOf(':');
  if (c < 0) return term;
  const userAlias = term.slice(0, c);
  const local = term.slice(c + 1);
  const uri = aliasToUri[userAlias];
  if (!uri) return term;
  const staticAlias = URI_TO_STATIC[uri];
  return staticAlias ? `${staticAlias}:${local}` : term;
}

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const acItems = ref<string[]>([]);
const acIndex = ref(0);
const acPos = ref({ top: 0, left: 0 });

function acIsInString(ta: HTMLTextAreaElement): boolean {
  let inStr = false, esc = false;
  for (let i = 0; i < ta.selectionStart; i++) {
    const c = ta.value[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') inStr = !inStr;
  }
  return inStr;
}

function acIsInComment(ta: HTMLTextAreaElement): boolean {
  const pos = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
  const line = ta.value.slice(lineStart, pos);
  let inStr = false, esc = false;
  for (const c of line) {
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (!inStr && c === '#') return true;
  }
  return false;
}

function acTokenAt(ta: HTMLTextAreaElement): { token: string; start: number } {
  const pos = ta.selectionStart;
  let i = pos - 1;
  while (i >= 0 && /[^\s;[\]{}<>()]/.test(ta.value[i])) i--;
  return { token: ta.value.slice(i + 1, pos), start: i + 1 };
}

function acLastToken(ta: HTMLTextAreaElement, tokenStart: number): string {
  const before = ta.value.slice(0, tokenStart).trimEnd();
  return before.split(/[\s;[\]{}<>()\n]+/).filter(Boolean).pop() ?? '';
}

function computeAcItems(ta: HTMLTextAreaElement): string[] {
  if (acIsInString(ta) || acIsInComment(ta)) return [];
  const { token, start } = acTokenAt(ta);
  const rawCtx = acLastToken(ta, start);

  const { aliasToUri, uriToAlias } = parsePrefixMaps(ta.value);
  const ctx = normalizeToken(rawCtx, aliasToUri);

  const remap = (term: string) => remapCompletion(term, uriToAlias);
  const filt = (list: string[]) => {
    const remapped = list.map(remap);
    return remapped.filter((c) => c !== token && c.toLowerCase().startsWith(token.toLowerCase()));
  };

  if (ctx === 'sh:nodeKind') return filt(AC_NODE_KINDS);
  if (ctx === 'dash:editor') return filt(AC_DASH);
  if (ctx === 'sh:datatype') return filt(AC_XSD);
  if (ctx === 'a') return filt(AC_TYPES);
  if (ctx === 'sh:group') {
    // Find PropertyGroup IRIs using whatever alias the user declared for the SHACL namespace.
    const shAlias = uriToAlias['http://www.w3.org/ns/shacl#'] ?? 'sh';
    const re = new RegExp(`([\\w:-]+)\\s+a\\s+${shAlias}:PropertyGroup`, 'g');
    const iris = [...ta.value.matchAll(re)].map((m) => m[1]);
    return filt([...new Set(iris)]);
  }
  if (token.length < 2) return [];
  return filt(AC_ALL).slice(0, 12);
}

function computeAcPos(ta: HTMLTextAreaElement): { top: number; left: number } {
  const rect = ta.getBoundingClientRect();
  const style = getComputedStyle(ta);
  const lhStr = style.lineHeight;
  const lh = lhStr === 'normal' ? parseFloat(style.fontSize) * 1.65 : parseFloat(lhStr);
  const pt = parseFloat(style.paddingTop) || 14;
  const pl = parseFloat(style.paddingLeft) || 14;
  const lines = ta.value.slice(0, ta.selectionStart).split('\n').length;
  const top = rect.top + pt + lines * lh - ta.scrollTop;
  return {
    top: Math.min(Math.max(top, rect.top + 4), window.innerHeight - 240),
    left: Math.min(rect.left + pl, window.innerWidth - 260),
  };
}

function updateAc(ta: HTMLTextAreaElement) {
  const items = computeAcItems(ta);
  acItems.value = items;
  acIndex.value = 0;
  if (items.length > 0) acPos.value = computeAcPos(ta);
}

function applyAcItem(item: string) {
  const ta = textareaRef.value;
  if (!ta) return;
  const { token, start } = acTokenAt(ta);
  const newVal = ta.value.slice(0, start) + item + ta.value.slice(start + token.length);
  ta.value = newVal;
  ta.selectionStart = ta.selectionEnd = start + item.length;
  shaclDraft.value = newVal;
  acItems.value = [];
  ta.dispatchEvent(new Event('input'));
}

function onShaclKeydown(e: KeyboardEvent) {
  if (!acItems.value.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    acIndex.value = (acIndex.value + 1) % acItems.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    acIndex.value = (acIndex.value - 1 + acItems.value.length) % acItems.value.length;
  } else if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault();
    applyAcItem(acItems.value[acIndex.value]);
  } else if (e.key === 'Escape') {
    acItems.value = [];
  }
}

function dismissAc() {
  acItems.value = [];
}

// ─────────────────────────────────────────────────────────────────────────────

const totalFields = computed(() =>
  schema.groups.reduce((s, g) => s + g.fields.length, 0),
);

function selectField(id: string | null) {
  if (!id) {
    selectedKind.value = 'schema';
    selectedId.value = null;
    selectedNestedShapeId.value = null;
    return;
  }
  selectedKind.value = 'field';
  selectedId.value = id;
  selectedNestedShapeId.value = null;
}

function selectGroup(id: string) {
  selectedKind.value = 'group';
  selectedId.value = id;
  selectedNestedShapeId.value = null;
}

function selectSchemaTarget() {
  selectedKind.value = 'schema';
  selectedId.value = null;
  selectedNestedShapeId.value = null;
}

function selectNestedShape(id: string) {
  selectedKind.value = 'nested-shape';
  selectedId.value = null;
  selectedNestedShapeId.value = id;
}

function selectNestedField(nsId: string, fieldId: string) {
  selectedKind.value = 'nested-field';
  selectedId.value = fieldId;
  selectedNestedShapeId.value = nsId;
}

function clearSelection() {
  selectSchemaTarget();
}

async function copyShacl() {
  try {
    await navigator.clipboard.writeText(shacl.value);
  } catch {
    /* clipboard may be unavailable in some contexts */
  }
}

// ── File operations ────────────────────────────────────────────────────────────

const fileHandle = ref<FileSystemFileHandle | null>(null);
const loadedShaclSource = ref<string | null>(null);
const loadedFileParseError = ref<string | null>(null);
const fileSaveStatus = ref<'idle' | 'saved' | 'error'>('idle');
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null;

const fileInputRef = ref<HTMLInputElement | null>(null);

function setSaved() {
  fileSaveStatus.value = 'saved';
  if (saveStatusTimer) clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => (fileSaveStatus.value = 'idle'), 2500);
}

async function openShacl() {
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as unknown as Window & {
        showOpenFilePicker(opts?: object): Promise<FileSystemFileHandle[]>;
      }).showOpenFilePicker({
        types: [{ description: 'Turtle / SHACL files', accept: { 'text/turtle': ['.ttl', '.n3', '.shacl'] } }],
        multiple: false,
      });
      fileHandle.value = handle;
      const file = await handle.getFile();
      loadedShaclSource.value = await file.text();
      applyLoadedShacl(loadedShaclSource.value);
      tab.value = 'definition';
    } catch {
      /* user cancelled */
    }
  } else {
    fileInputRef.value?.click();
  }
}

function onFileInputChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    loadedShaclSource.value = reader.result as string;
    applyLoadedShacl(loadedShaclSource.value);
    tab.value = 'definition';
  };
  reader.readAsText(file);
  (e.target as HTMLInputElement).value = '';
}

function applyLoadedShacl(source: string): void {
  shaclDraft.value = source;
  userEditingShacl = true;
  if (shaclEditTimeout) clearTimeout(shaclEditTimeout);
  shaclEditTimeout = setTimeout(() => { userEditingShacl = false; }, 3000);

  const result = parseShacl(source);

  // Always wipe the current schema — a file load is a complete replacement.
  mutate((d) => {
    d.schemaName = '';
    d.schemaDescription = '';
    d.shapeIri = ':Shape';
    d.targetClass = '';
    d.prefixes = [];
    d.groups = [];
    d.nestedShapes = [];
    if (result.schema) Object.assign(d, result.schema);
  });

  if (result.schema) {
    loadedFileParseError.value = null;
  } else {
    const line = result.errorLine ? ` (line ${result.errorLine})` : '';
    loadedFileParseError.value = `${result.error}${line}`;
  }
}

function discardLoadedSource() {
  loadedShaclSource.value = null;
  loadedFileParseError.value = null;
  fileHandle.value = null;
  shaclDraft.value = shacl.value;
  userEditingShacl = false;
}

async function writeToHandle(handle: FileSystemFileHandle, content: string) {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function saveShacl() {
  if (fileHandle.value) {
    try {
      await writeToHandle(fileHandle.value, shacl.value);
      setSaved();
    } catch {
      fileSaveStatus.value = 'error';
    }
  } else {
    await saveAsShacl();
  }
}

async function saveAsShacl() {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as unknown as Window & {
        showSaveFilePicker(opts?: object): Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: (schema.schemaName || 'schema').replace(/\s+/g, '-').toLowerCase() + '.ttl',
        types: [{ description: 'Turtle file', accept: { 'text/turtle': ['.ttl'] } }],
      });
      fileHandle.value = handle;
      await writeToHandle(handle, shacl.value);
      setSaved();
    } catch {
      /* user cancelled */
    }
  } else {
    const suggested = (schema.schemaName || 'schema').replace(/\s+/g, '-').toLowerCase() + '.ttl';
    const filename = window.prompt('Save file as:', suggested);
    if (!filename) return;
    const blob = new Blob([shacl.value], { type: 'text/turtle' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.ttl') ? filename : filename + '.ttl';
    a.click();
    URL.revokeObjectURL(url);
    setSaved();
  }
}
</script>

<template>
  <div>
    <header class="app-header">
      <div class="app-header__brand">
        <img :src="contourIcon" alt="Contour" class="app-header__logo-img" />
        <div class="brand__text">
          <span class="brand__wordmark">Contour</span>
          <span class="brand__tagline">Visual schemas. Clean SHACL.</span>
        </div>
      </div>
      <nav class="app-header__nav">
        <a href="#" class="is-active" @click.prevent>{{ t('header.metadataSchemas') }}</a>
      </nav>
      <div class="app-header__spacer" />
      <div class="app-header__file-toolbar">
        <div class="lang-switch" role="group" :aria-label="t('header.language')">
          <button
            v-for="l in LOCALES"
            :key="l.code"
            class="lang-switch__btn"
            :class="{ 'is-active': locale === l.code }"
            :aria-pressed="locale === l.code"
            @click="setLocale(l.code)"
          >{{ l.label }}</button>
        </div>
        <button class="btn btn-ghost btn-sm" :title="t('header.openTitle')" @click="openShacl">
          <Icon name="folder" :size="13" /> {{ t('common.open') }}
        </button>
        <button class="btn btn-ghost btn-sm" :title="t('header.saveTitle')" @click="saveShacl">
          <Icon name="check" :size="13" />
          {{ fileSaveStatus === 'saved' ? t('common.saved') : fileSaveStatus === 'error' ? t('common.error') : t('common.save') }}
        </button>
        <button class="btn btn-secondary btn-sm" :title="t('header.saveAsTitle')" @click="saveAsShacl">
          <Icon name="duplicate" :size="13" /> {{ t('common.saveAs') }}
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".ttl,.n3,.shacl"
          style="display:none"
          @change="onFileInputChange"
        />
      </div>
    </header>

    <div class="app-page">
      <h1 class="app-page__title">
        {{ t('page.edit', { name: schema.schemaName || t('page.defaultSchemaName') }) }}
      </h1>

      <ul class="nav-tabs">
        <li>
          <button
            class="nav-link"
            :class="{ active: tab === 'definition' }"
            @click="tab = 'definition'"
          >
            <Icon name="code" :size="14" /> {{ t('tabs.definition') }}
          </button>
        </li>
        <li>
          <button
            class="nav-link"
            :class="{ active: tab === 'visual' }"
            @click="tab = 'visual'"
          >
            <Icon name="wand" :size="14" /> {{ t('tabs.visualEditor') }}
            <span class="tag-new">{{ t('tabs.new') }}</span>
          </button>
        </li>
        <li>
          <button
            class="nav-link"
            :class="{ active: tab === 'preview' }"
            @click="tab = 'preview'"
          >
            <Icon name="eye" :size="14" /> {{ t('tabs.formPreview') }}
          </button>
        </li>
      </ul>

      <!-- Visual editor tab -->
      <template v-if="tab === 'visual'">
        <div class="tabs-callout" v-html="t('visual.calloutHtml')" />

        <div class="workbench">
          <Palette />
          <Canvas
            :schema="schema"
            :mutate="mutate"
            :selected-kind="selectedKind"
            :selected-id="selectedId"
            :selected-nested-shape-id="selectedNestedShapeId"
            @select-field="selectField"
            @select-group="selectGroup"
            @select-schema="selectSchemaTarget"
            @select-nested-shape="selectNestedShape"
            @select-nested-field="selectNestedField"
          />
          <Inspector
            :schema="schema"
            :mutate="mutate"
            :selected-kind="selectedKind"
            :selected-id="selectedId"
            :selected-nested-shape-id="selectedNestedShapeId"
            @clear="clearSelection"
          />
        </div>

        <div v-if="showShaclPreview" class="preview-pane">
          <div class="preview-pane__header">
            <div class="preview-pane__title">
              {{ previewMode === 'shacl' ? t('preview.generatedShacl') : t('preview.formPreview') }}
            </div>
            <div style="display: flex; align-items: center; gap: 12px">
              <div class="preview-pane__tabs">
                <span
                  class="preview-pane__tab"
                  :class="{ 'is-active': previewMode === 'shacl' }"
                  @click="previewMode = 'shacl'"
                  >{{ t('preview.tabShacl') }}</span
                >
                <span
                  class="preview-pane__tab"
                  :class="{ 'is-active': previewMode === 'form' }"
                  @click="previewMode = 'form'"
                  >{{ t('preview.tabForm') }}</span
                >
              </div>
              <button
                v-if="previewMode === 'shacl'"
                class="btn btn-ghost btn-xs"
                :title="t('preview.copyTurtle')"
                @click="copyShacl"
              >
                <Icon name="duplicate" :size="12" /> {{ t('common.copy') }}
              </button>
            </div>
          </div>
          <div class="preview-pane__body">
            <pre
              v-if="previewMode === 'shacl'"
              class="shacl-output"
              v-html="shaclHtml"
            />
            <FormPreview v-else :schema="schema" />
          </div>
        </div>

        <div class="actions-bar">
          <div class="actions-bar__hint">
            <Icon name="check" :size="12" />
            <span class="ok">{{ plural('count.properties', totalFields) }} · {{ plural('count.groups', schema.groups.length) }}</span>
          </div>
          <div style="display: flex; gap: 10px">
            <button class="btn btn-ghost btn-sm" @click="copyShacl">
              <Icon name="duplicate" :size="13" /> {{ t('common.copyShacl') }}
            </button>
            <button class="btn btn-secondary btn-sm" @click="saveShacl">
              <Icon name="check" :size="13" /> {{ t('common.save') }}
            </button>
            <button class="btn btn-primary btn-sm" @click="saveAsShacl">
              {{ t('common.saveAs') }}
            </button>
          </div>
        </div>
      </template>

      <!-- Definition tab -->
      <template v-else-if="tab === 'definition'">
        <div class="legacy-form">
          <div class="form__group">
            <label>{{ t('definition.name') }}</label>
            <input
              type="text"
              :value="schema.schemaName"
              @input="mutate((d) => (d.schemaName = ($event.target as HTMLInputElement).value))"
            />
          </div>
          <div class="form__group">
            <label>{{ t('definition.description') }}</label>
            <textarea
              :value="schema.schemaDescription"
              rows="2"
              @input="mutate((d) => (d.schemaDescription = ($event.target as HTMLTextAreaElement).value))"
            />
          </div>
          <div class="form__group">
            <label
              style="display: flex; justify-content: space-between; align-items: center"
            >
              <span>
                {{ t('definition.formDefinition') }}
                <span v-if="loadedShaclSource" class="loaded-badge">{{ t('definition.loadedFromFile') }}</span>
              </span>
              <div style="display: flex; gap: 8px; align-items: center">
                <button
                  v-if="loadedShaclSource"
                  class="btn btn-ghost btn-sm"
                  :title="t('definition.discardLoadedTitle')"
                  @click="discardLoadedSource"
                >
                  {{ t('definition.discardLoaded') }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="tab = 'visual'">
                  <Icon name="wand" :size="12" /> {{ t('definition.openInVisualEditor') }}
                </button>
              </div>
            </label>
            <textarea
              ref="textareaRef"
              class="turtle-area"
              :value="shaclDraft"
              spellcheck="false"
              @input="onShaclDraftInput"
              @keydown="onShaclKeydown"
              @blur="dismissAc"
              @click="dismissAc"
            />
            <p v-if="loadedFileParseError" class="shacl-parse-error">
              ⚠ {{ t('definition.importError', { error: loadedFileParseError }) }}
            </p>
            <p v-else-if="shaclParseError" class="shacl-parse-error">
              ⚠ {{ shaclParseError }}
            </p>
            <div style="margin-top: 8px; font-size: 12px; color: var(--color-text-lighter)">
              {{ t('definition.syncHint') }}
            </div>
          </div>
          <div style="margin-top: 18px; display: flex; gap: 10px">
            <button class="btn btn-secondary" @click="saveShacl">
              <Icon name="check" :size="13" /> {{ t('common.save') }}
            </button>
            <button class="btn btn-primary" @click="saveAsShacl">{{ t('common.saveAs') }}</button>
          </div>
        </div>
      </template>

      <!-- Form Preview tab -->
      <template v-else>
        <div class="preview-pane" style="margin-top: 20px">
          <div class="preview-pane__header">
            <div class="preview-pane__title">{{ t('formPreviewTab.rendered') }}</div>
            <div style="font-size: 12px; color: var(--color-text-lighter)">
              {{ plural('count.fields', totalFields) }} · {{ t('formPreviewTab.target') }}
              <span style="font-family: var(--font-mono)">{{ schema.targetClass }}</span>
            </div>
          </div>
          <div style="max-height: none; overflow: visible">
            <FormPreview :schema="schema" />
          </div>
        </div>
      </template>
    </div>

    <Teleport to="body">
      <div
        v-if="acItems.length"
        class="shacl-ac-dropdown"
        :style="{ top: acPos.top + 'px', left: acPos.left + 'px' }"
      >
        <div
          v-for="(item, i) in acItems"
          :key="item"
          class="shacl-ac-item"
          :class="{ 'is-active': i === acIndex }"
          @mousedown.prevent="applyAcItem(item)"
        >{{ item }}</div>
      </div>
    </Teleport>
  </div>
</template>
