<script setup lang="ts">
// One field in the rendered form. Recurses through DetailsEditor → nested
// shape so sub-forms render at any depth. Two modes:
//  - Form Preview (no `node`): a stateless mock-up that holds its own
//    value-count and tooltip state so repeated instances are independent.
//  - Record tab (`node` set): bound to the record's values for this field,
//    with per-value add/remove and inline validation issues.
import { computed, inject, ref } from 'vue';
import type { Field, NestedShape, Schema } from '../types';
import { fieldKey, type RecordNode, type RecordValue } from '../record';
import { FILL_CONTEXT } from '../composables/useFillContext';
import { useI18n } from '../composables/useI18n';
import FieldInput from './FieldInput.vue';
import Icon from './Icon.vue';

const props = defineProps<{ field: Field; schema: Schema; node?: RecordNode; loc?: string }>();
const { t } = useI18n();
const fill = inject(FILL_CONTEXT, null);

const tipOpen = ref(false);

const filling = computed(() => !!props.node && !!fill);
const key = computed(() => fieldKey(props.field));
const fieldLoc = computed(() => (props.loc ? `${props.loc}/${key.value}` : key.value));
const entries = computed<RecordValue[]>(() => props.node?.[key.value] ?? []);

const required = computed(() => (props.field.minCount || 0) > 0);
const multi = computed(() => {
  const mc = props.field.maxCount;
  return mc === null || mc === undefined || mc > 1;
});

// Honour the cardinality bounds: start at the minimum (≥1 so something shows),
// never add past maxCount, never remove below minCount.
const minN = computed(() => Math.max(1, props.field.minCount || 0));
const maxN = computed(() => (props.field.maxCount == null ? Infinity : props.field.maxCount));
const count = ref(Math.max(1, props.field.minCount || 0));
const rows = computed(() => (filling.value ? entries.value.length : count.value));
const canAdd = computed(() => rows.value < maxN.value);
const canRemove = computed(() => rows.value > minN.value);

function addValue() {
  if (!canAdd.value) return;
  if (filling.value) {
    const list = props.node![key.value] || (props.node![key.value] = []);
    list.push(fill!.newEntry(props.field));
  } else count.value++;
}
function removeValue(idx: number) {
  if (!canRemove.value) return;
  if (filling.value) entries.value.splice(idx, 1);
  else count.value--;
}

// In the Record tab only rdf:langString takes a tag: an rdf:HTML literal can't
// also carry a language in RDF.
const isLangTagged = computed(() =>
  props.field.datatype === 'rdf:langString' || (!filling.value && props.field.datatype === 'rdf:HTML'),
);
function setLang(idx: number, e: Event) {
  entries.value[idx].lang = (e.target as HTMLInputElement).value;
}

// "1–3", "1+", "0–1" — a compact cardinality hint, shown when bounds are set.
const cardinality = computed(() => {
  const min = props.field.minCount;
  const max = props.field.maxCount;
  if ((min === null || min === undefined) && (max === null || max === undefined)) return '';
  const lo = min ?? 0;
  const hi = max === null || max === undefined ? '∞' : max;
  return `${lo}–${hi}`;
});

const nestedShape = computed<NestedShape | null>(() =>
  props.field.node
    ? (props.schema.nestedShapes || []).find((ns) => ns.iri === props.field.node) ?? null
    : null,
);
const nestedFields = computed<Field[]>(() =>
  (nestedShape.value?.fields || []).slice().sort((a, b) => a.order - b.order),
);

// Validation issues (Record tab): field-level ones under the field, value-level
// ones under their row. Missing required values render as a quiet hint.
const issues = computed(() => (filling.value ? fill!.issuesAt(fieldLoc.value) : []));
const fieldIssues = computed(() => issues.value.filter((i) => i.index === undefined));
const valueIssues = (idx: number) => issues.value.filter((i) => i.index === idx);

function labelFromPath(path: string): string {
  let local = path;
  if (path.startsWith('<')) {
    const m = path.match(/[#/]([^#/>]+)>?$/);
    local = m ? m[1] : path.replace(/[<>]/g, '');
  } else {
    const colon = path.indexOf(':');
    if (colon >= 0) local = path.slice(colon + 1);
  }
  return local
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}
</script>

<template>
  <div class="form-row" :data-loc="filling ? fieldLoc : undefined">
    <div class="form-preview__label-row">
      <label :class="{ required }">{{ field.name || labelFromPath(field.path) }}</label>
      <span v-if="cardinality" class="form-preview__card">{{ cardinality }}</span>
      <button
        v-if="field.description"
        class="form-preview__info-btn"
        type="button"
        :class="{ 'is-open': tipOpen }"
        @click.stop="tipOpen = !tipOpen"
      >
        <Icon name="info" :size="13" />
        <span class="form-preview__tooltip">{{ field.description }}</span>
      </button>
    </div>

    <!-- DetailsEditor: render the linked nested shape's fields inline, recursively -->
    <template v-if="field.widgetId === 'DetailsEditor'">
      <template v-if="nestedShape">
        <div v-for="i in rows" :key="i" class="form-preview__nested-form">
          <button
            v-if="multi && canRemove"
            class="form-preview__remove-btn form-preview__nested-remove"
            type="button"
            :title="t('formPreview.removeValue')"
            @click="removeValue(i - 1)"
          >×</button>
          <template v-if="filling">
            <PreviewField
              v-for="nf in (entries[i - 1].node ? nestedFields : [])"
              :key="nf.id"
              :field="nf"
              :schema="schema"
              :node="entries[i - 1].node"
              :loc="`${fieldLoc}/${i - 1}`"
            />
          </template>
          <PreviewField v-for="nf in nestedFields" v-else :key="nf.id" :field="nf" :schema="schema" />
        </div>
      </template>
      <div v-else class="form-preview__nested">
        ▢ {{ field.node ? t('formPreview.nestedSubform', { iri: field.node }) : t('formPreview.nestedSubformGeneric') }}
      </div>
    </template>

    <!-- All other widgets -->
    <template v-else>
      <template v-for="i in rows" :key="i">
        <div class="form-preview__value-row">
          <div class="form-preview__value-input">
            <FieldInput
              v-if="filling"
              :field="field"
              :entry="entries[i - 1]"
              :invalid="valueIssues(i - 1).some((x) => x.severity === 'error')"
            />
            <FieldInput v-else :field="field" />
          </div>
          <input
            v-if="isLangTagged && filling"
            class="form-preview__lang"
            type="text"
            placeholder="en"
            :title="t('formPreview.langTag')"
            :value="entries[i - 1].lang"
            @input="setLang(i - 1, $event)"
          />
          <input v-else-if="isLangTagged" class="form-preview__lang" type="text" placeholder="en" :title="t('formPreview.langTag')" />
          <button
            v-if="multi && canRemove"
            class="form-preview__remove-btn"
            type="button"
            :title="t('formPreview.removeValue')"
            @click="removeValue(i - 1)"
          >×</button>
        </div>
        <p
          v-for="(iss, k) in valueIssues(i - 1)"
          :key="`v${k}`"
          class="record-issue"
          :class="`is-${iss.severity}`"
        >{{ fill!.issueText(iss) }}</p>
      </template>
    </template>

    <button
      v-if="multi"
      class="form-preview__add-btn"
      type="button"
      :disabled="!canAdd"
      :title="canAdd ? '' : t('formPreview.maxReached', { max: maxN })"
      @click="addValue"
    >
      {{ t('formPreview.add') }}
    </button>

    <p
      v-for="(iss, k) in fieldIssues"
      :key="`f${k}`"
      class="record-issue"
      :class="iss.code === 'minCount' ? 'is-hint' : `is-${iss.severity}`"
    >{{ fill!.issueText(iss) }}</p>

    <p v-if="field.message && !filling" class="form-preview__msg" :class="`sev-${(field.severity || 'sh:Violation').replace('sh:', '').toLowerCase()}`">
      {{ field.message }}
    </p>
  </div>
</template>
