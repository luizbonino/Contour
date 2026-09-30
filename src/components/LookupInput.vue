<script setup lang="ts">
// Reference-field input for the Record tab: free-text IRI plus a searchable
// list of known instances (saved records, imported vocabularies, sh:in),
// filtered by the field's sh:class. Stores the chosen item's IRI.
import { computed, inject, ref } from 'vue';
import type { Field } from '../types';
import type { LookupItem } from '../lookup';
import type { RecordValue } from '../record';
import { FILL_CONTEXT } from '../composables/useFillContext';
import { useI18n } from '../composables/useI18n';

const props = defineProps<{ field: Field; entry: RecordValue; invalid?: boolean }>();
const fill = inject(FILL_CONTEXT)!;
const { t } = useI18n();

const open = ref(false);
const active = ref(0);

const chosen = computed(() => (props.entry.value ? fill.describe(props.field, props.entry.value) : undefined));
// Once a known item is chosen, reopening shows the full list again.
const results = computed(() => fill.search(props.field, chosen.value ? '' : props.entry.value));

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
        <span class="lookup__meta">
          <span class="lookup__iri">{{ it.iri }}</span>
          <span class="lookup__source">{{ sourceLabel(it) }}</span>
        </span>
      </button>
      <div v-if="!results.length" class="lookup__empty">
        {{ entry.value ? t('lookup.noMatches') : emptyText }}
      </div>
    </div>
    <div v-if="chosen && chosen.label" class="lookup__chosen">
      ✓ {{ chosen.label }} <span class="lookup__source">{{ sourceLabel(chosen) }}</span>
    </div>
  </div>
</template>
