<script setup lang="ts">
// Reference-field input for the Record tab: free-text IRI plus a searchable
// list of known instances (saved records, imported vocabularies, sh:in),
// filtered by the field's sh:class — and, when the field declares a remote
// lookup source, results from that service. Stores the chosen item's IRI.
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import type { Field } from '../types';
import type { LookupItem } from '../lookup';
import type { RecordValue } from '../record';
import { MIN_REMOTE_CHARS, RemoteLookupError, SERVICE_LABELS } from '../remote';
import { FILL_CONTEXT } from '../composables/useFillContext';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{ field: Field; entry: RecordValue; invalid?: boolean }>();
const fill = inject(FILL_CONTEXT)!;
const { t } = useI18n();

const open = ref(false);
const active = ref(0);

const chosen = computed(() => (props.entry.value ? fill.describe(props.field, props.entry.value) : undefined));
// Once a known item is chosen, reopening shows the full list again.
const query = computed(() => (chosen.value ? '' : props.entry.value));
const localResults = computed(() => fill.search(props.field, query.value));

// ── Remote source ──────────────────────────────────────────────────────────
const service = computed(() => (props.field.lookup ? SERVICE_LABELS[props.field.lookup.service] : ''));
const remoteItems = ref<LookupItem[]>([]);
const remoteState = ref<'idle' | 'loading' | 'error'>('idle');
const remoteError = ref('');
let timer: ReturnType<typeof setTimeout> | null = null;
let ctrl: AbortController | null = null;

function cancelRemote() {
  if (timer) clearTimeout(timer);
  ctrl?.abort();
  ctrl = null;
}

function runRemote() {
  cancelRemote();
  ctrl = new AbortController();
  const signal = ctrl.signal;
  const p = fill.remote(props.field, query.value, signal);
  if (!p) return;
  remoteState.value = 'loading';
  p.then((items) => {
    if (signal.aborted) return;
    remoteItems.value = items;
    remoteState.value = 'idle';
  }).catch((e: unknown) => {
    if (signal.aborted) return;
    remoteItems.value = [];
    remoteState.value = 'error';
    const code = e instanceof RemoteLookupError ? e.message : 'unreachable';
    remoteError.value = code.startsWith('HTTP')
      ? t('lookup.remoteHttp', { service: service.value, status: code.slice(5) })
      : t(`lookup.remote.${code}`, { service: service.value });
  });
}

const tooShort = computed(
  () => !!props.field.lookup && props.field.lookup.service !== 'sparql' && query.value.trim().length < MIN_REMOTE_CHARS,
);

watch([query, open], () => {
  if (!open.value || !props.field.lookup) return;
  if (tooShort.value) { cancelRemote(); remoteItems.value = []; remoteState.value = 'idle'; return; }
  if (timer) clearTimeout(timer);
  timer = setTimeout(runRemote, 300);
});
onBeforeUnmount(cancelRemote);

// Local matches first, then remote ones not already listed.
const results = computed(() => {
  const seen = new Set(localResults.value.map((i) => i.iri));
  return [...localResults.value, ...remoteItems.value.filter((i) => !seen.has(i.iri))];
});

const placeholder = computed(() =>
  props.field.class ? t('fieldInput.searchClass', { class: props.field.class }) : t('fieldInput.search'),
);
const emptyText = computed(() =>
  props.field.class ? t('lookup.noneOfClass', { class: props.field.class }) : t('lookup.none'),
);

function sourceLabel(it: LookupItem): string {
  if (it.sourceKind === 'record') return t('lookup.sourceRecord', { name: it.source });
  if (it.sourceKind === 'in') return t('lookup.sourceIn');
  return it.source;
}

function onInput(e: Event) {
  props.entry.value = (e.target as HTMLInputElement).value;
  open.value = true;
  active.value = 0;
}

function choose(it: LookupItem) {
  props.entry.value = it.sourceKind === 'in' ? it.label : it.iri;
  open.value = false;
}

function onKeydown(e: KeyboardEvent) {
  const n = results.value.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    open.value = true;
    if (n) active.value = (active.value + 1) % n;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (n) active.value = (active.value - 1 + n) % n;
  } else if (e.key === 'Enter' && open.value && n) {
    e.preventDefault();
    choose(results.value[active.value]);
  } else if (e.key === 'Escape') {
    open.value = false;
  }
}
</script>

<template>
  <div class="lookup">
    <input
      type="text"
      class="mono"
      :class="{ 'is-invalid': invalid }"
      role="combobox"
      :aria-expanded="open"
      :value="entry.value"
      :placeholder="placeholder"
      @input="onInput"
      @focus="open = true; active = 0"
      @blur="open = false"
      @keydown="onKeydown"
    />
    <div v-if="open" class="lookup__list" role="listbox">
      <button
        v-for="(it, i) in results"
        :key="it.iri + it.source"
        type="button"
        class="lookup__item"
        :class="{ 'is-active': i === active }"
        role="option"
        :aria-selected="i === active"
        @mousedown.prevent="choose(it)"
      >
        <span class="lookup__label">{{ it.label || it.iri }}</span>
        <span v-if="it.description" class="lookup__desc">{{ it.description }}</span>
        <span class="lookup__meta">
          <span class="lookup__iri">{{ it.iri }}</span>
          <span class="lookup__source">{{ sourceLabel(it) }}</span>
        </span>
      </button>
      <div v-if="remoteState === 'loading'" class="lookup__status">{{ t('lookup.remoteSearching', { service }) }}</div>
      <div v-else-if="remoteState === 'error'" class="lookup__status is-error">{{ remoteError }}</div>
      <div v-else-if="tooShort && field.lookup" class="lookup__status">{{ t('lookup.remoteMinChars', { service, n: 2 }) }}</div>
      <div v-if="!results.length && remoteState !== 'loading'" class="lookup__empty">
        {{ entry.value ? t('lookup.noMatches') : emptyText }}
      </div>
    </div>
    <div v-if="chosen && chosen.label" class="lookup__chosen">
      ✓ {{ chosen.label }} <span class="lookup__source">{{ sourceLabel(chosen) }}</span>
    </div>
  </div>
</template>
