<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSchemaStore } from './composables/useSchema';
import { generateShacl, highlightTurtle } from './shacl';
import type { SelectedKind } from './types';
import Icon from './components/Icon.vue';
import Palette from './components/Palette.vue';
import Canvas from './components/Canvas.vue';
import Inspector from './components/Inspector.vue';
import FormPreview from './components/FormPreview.vue';

const { schema, mutate } = useSchemaStore();

type Tab = 'definition' | 'visual' | 'preview';
const tab = ref<Tab>('visual');

const selectedKind = ref<SelectedKind>('schema');
const selectedId = ref<string | null>(null);

type PreviewMode = 'shacl' | 'form';
const previewMode = ref<PreviewMode>('shacl');
const showShaclPreview = ref(true);

const shacl = computed(() => generateShacl(schema));
const shaclHtml = computed(() => highlightTurtle(shacl.value));

const totalFields = computed(() =>
  schema.groups.reduce((s, g) => s + g.fields.length, 0),
);

function selectField(id: string | null) {
  if (!id) {
    selectedKind.value = 'schema';
    selectedId.value = null;
    return;
  }
  selectedKind.value = 'field';
  selectedId.value = id;
}

function selectGroup(id: string) {
  selectedKind.value = 'group';
  selectedId.value = id;
}

function selectSchemaTarget() {
  selectedKind.value = 'schema';
  selectedId.value = null;
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
    tab.value = 'definition';
  };
  reader.readAsText(file);
  (e.target as HTMLInputElement).value = '';
}

function discardLoadedSource() {
  loadedShaclSource.value = null;
  fileHandle.value = null;
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
    const blob = new Blob([shacl.value], { type: 'text/turtle' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (schema.schemaName || 'schema').replace(/\s+/g, '-').toLowerCase() + '.ttl';
    a.click();
    URL.revokeObjectURL(url);
    setSaved();
  }
}
</script>

<template>
  <div>
    <header class="fdp-header">
      <div class="fdp-header__logo">
        <img src="/fdp-logo.png" alt="FAIR Data Point" class="fdp-header__logo-img" />
      </div>
      <nav class="fdp-header__nav">
        <a href="#" class="is-active" @click.prevent>Metadata Schemas</a>
      </nav>
      <div class="fdp-header__spacer" />
      <div class="fdp-header__file-toolbar">
        <button class="btn btn-ghost btn-sm" title="Open a SHACL Turtle file" @click="openShacl">
          <Icon name="folder" :size="13" /> Open…
        </button>
        <button class="btn btn-ghost btn-sm" title="Save to current file (Ctrl+S)" @click="saveShacl">
          <Icon name="check" :size="13" />
          {{ fileSaveStatus === 'saved' ? 'Saved!' : fileSaveStatus === 'error' ? 'Error' : 'Save' }}
        </button>
        <button class="btn btn-secondary btn-sm" title="Save as a new file" @click="saveAsShacl">
          <Icon name="duplicate" :size="13" /> Save As…
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

    <div class="fdp-page">
      <h1 class="fdp-page__title">
        Edit {{ schema.schemaName || 'Metadata Schema' }}
      </h1>

      <ul class="nav-tabs">
        <li>
          <button
            class="nav-link"
            :class="{ active: tab === 'definition' }"
            @click="tab = 'definition'"
          >
            <Icon name="code" :size="14" /> Definition
          </button>
        </li>
        <li>
          <button
            class="nav-link"
            :class="{ active: tab === 'visual' }"
            @click="tab = 'visual'"
          >
            <Icon name="wand" :size="14" /> Visual Editor
            <span class="tag-new">New</span>
          </button>
        </li>
        <li>
          <button
            class="nav-link"
            :class="{ active: tab === 'preview' }"
            @click="tab = 'preview'"
          >
            <Icon name="eye" :size="14" /> Form Preview
          </button>
        </li>
      </ul>

      <!-- Visual editor tab -->
      <template v-if="tab === 'visual'">
        <div class="tabs-callout">
          <strong>Visual Editor</strong> — drag DASH form widgets from the left
          palette onto the canvas. Each widget becomes a SHACL
          <code>sh:property</code>. The corresponding Turtle is generated live
          below — you can switch to the <strong>Definition</strong> tab to view
          or edit it directly.
        </div>

        <div class="workbench">
          <Palette />
          <Canvas
            :schema="schema"
            :mutate="mutate"
            :selected-kind="selectedKind"
            :selected-id="selectedId"
            @select-field="selectField"
            @select-group="selectGroup"
            @select-schema="selectSchemaTarget"
          />
          <Inspector
            :schema="schema"
            :mutate="mutate"
            :selected-kind="selectedKind"
            :selected-id="selectedId"
            @clear="clearSelection"
          />
        </div>

        <div v-if="showShaclPreview" class="preview-pane">
          <div class="preview-pane__header">
            <div class="preview-pane__title">
              {{ previewMode === 'shacl' ? 'Generated SHACL (Turtle)' : 'Form preview' }}
            </div>
            <div style="display: flex; align-items: center; gap: 12px">
              <div class="preview-pane__tabs">
                <span
                  class="preview-pane__tab"
                  :class="{ 'is-active': previewMode === 'shacl' }"
                  @click="previewMode = 'shacl'"
                  >SHACL</span
                >
                <span
                  class="preview-pane__tab"
                  :class="{ 'is-active': previewMode === 'form' }"
                  @click="previewMode = 'form'"
                  >Form</span
                >
              </div>
              <button
                v-if="previewMode === 'shacl'"
                class="btn btn-ghost btn-xs"
                title="Copy Turtle"
                @click="copyShacl"
              >
                <Icon name="duplicate" :size="12" /> Copy
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
            <span class="ok">{{ totalFields }} properties · {{ schema.groups.length }} groups</span>
          </div>
          <div style="display: flex; gap: 10px">
            <button class="btn btn-ghost btn-sm" @click="copyShacl">
              <Icon name="duplicate" :size="13" /> Copy SHACL
            </button>
            <button class="btn btn-secondary btn-sm" @click="saveShacl">
              <Icon name="check" :size="13" /> Save
            </button>
            <button class="btn btn-primary btn-sm" @click="saveAsShacl">
              Save As…
            </button>
          </div>
        </div>
      </template>

      <!-- Definition tab -->
      <template v-else-if="tab === 'definition'">
        <div class="legacy-form">
          <div class="form__group">
            <label>Name</label>
            <input
              type="text"
              :value="schema.schemaName"
              @input="mutate((d) => (d.schemaName = ($event.target as HTMLInputElement).value))"
            />
          </div>
          <div class="form__group">
            <label>Description</label>
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
                Form Definition (SHACL · Turtle)
                <span v-if="loadedShaclSource" class="loaded-badge">Loaded from file</span>
              </span>
              <div style="display: flex; gap: 8px; align-items: center">
                <button
                  v-if="loadedShaclSource"
                  class="btn btn-ghost btn-sm"
                  title="Discard loaded file and show generated SHACL"
                  @click="discardLoadedSource"
                >
                  Discard loaded file
                </button>
                <button class="btn btn-secondary btn-sm" @click="tab = 'visual'">
                  <Icon name="wand" :size="12" /> Open in Visual Editor
                </button>
              </div>
            </label>
            <pre
              v-if="loadedShaclSource"
              class="turtle-area shacl-output"
              style="white-space: pre-wrap; word-break: break-word"
            >{{ loadedShaclSource }}</pre>
            <pre v-else class="turtle-area shacl-output" v-html="shaclHtml" />
            <div
              style="margin-top: 8px; font-size: 12px; color: var(--color-text-lighter)"
            >
              <template v-if="loadedShaclSource">
                Showing loaded file. Use <strong>Open in Visual Editor</strong> to build the schema visually; the editor will generate fresh SHACL from the visual model.
              </template>
              <template v-else>
                Turtle source generated from the Visual Editor.
              </template>
            </div>
          </div>
          <div style="margin-top: 18px; display: flex; gap: 10px">
            <button class="btn btn-secondary" @click="saveShacl">
              <Icon name="check" :size="13" /> Save
            </button>
            <button class="btn btn-primary" @click="saveAsShacl">Save As…</button>
          </div>
        </div>
      </template>

      <!-- Form Preview tab -->
      <template v-else>
        <div class="preview-pane" style="margin-top: 20px">
          <div class="preview-pane__header">
            <div class="preview-pane__title">Rendered form preview</div>
            <div style="font-size: 12px; color: var(--color-text-lighter)">
              {{ totalFields }} fields · target
              <span style="font-family: var(--font-mono)">{{ schema.targetClass }}</span>
            </div>
          </div>
          <div style="max-height: none; overflow: visible">
            <FormPreview :schema="schema" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
