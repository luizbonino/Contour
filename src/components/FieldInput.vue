<script setup lang="ts">
import { computed } from 'vue';
import type { Field } from '../types';
import type { RecordValue } from '../record';
import { useI18n } from '../composables/useI18n';
import LookupInput from './LookupInput.vue';

// `entry` is set only in the Record tab: the input is then bound to that
// value. Without it (Form Preview) the inputs stay uncontrolled mock-ups.
const props = defineProps<{ field: Field; entry?: RecordValue; invalid?: boolean }>();
const { t } = useI18n();

// Reflect SHACL constraints onto the preview inputs so the rendered form
// behaves like the real one (required, length, pattern, range).
const required = computed(() => (props.field.minCount || 0) > 0);
const maxlength = computed(() => props.field.maxLength ?? undefined);
const minlength = computed(() => props.field.minLength ?? undefined);
const pattern = computed(() => props.field.pattern || undefined);
const numStep = computed(() => (props.field.datatype === 'xsd:integer' ? '1' : 'any'));

const isReference = computed(() =>
  ['URIEditor', 'AutoCompleteEditor', 'InstancesSelectEditor'].includes(props.field.widgetId),
);
const isLookup = computed(() => props.field.widgetId !== 'URIEditor' && isReference.value);

// Reference widgets (AutoComplete / Instances select) look up *instances* — that
// index is supplied by the host platform (e.g. the FAIR Data Point) at
// data-entry time, scoped to the field's sh:class. The Form Preview has no
// such source, so it just signals what would be searched; the Record tab
// searches Contour's own records and vocabularies (LookupInput).
const refPlaceholder = computed(() => {
  if (props.field.widgetId === 'URIEditor') return 'http://…';
  return props.field.class
    ? t('fieldInput.searchClass', { class: props.field.class })
    : t('fieldInput.search');
});

// Value binding for the Record tab; empty (uncontrolled) in the preview.
const bind = computed(() =>
  props.entry
    ? {
        value: props.entry.value,
        class: { 'is-invalid': props.invalid },
        onInput: (e: Event) => { props.entry!.value = (e.target as HTMLInputElement).value; },
      }
    : {},
);

// Date & time widget: two inputs over one xsd:dateTime lexical value.
const dtDate = computed(() => (props.entry?.value || '').split('T')[0] || '');
const dtTime = computed(() => ((props.entry?.value || '').split('T')[1] || '').slice(0, 8));
function setDateTime(date: string, time: string) {
  if (!props.entry) return;
  props.entry.value = date ? `${date}T${time || '00:00'}` : time ? `T${time}` : '';
}
</script>

<template>
  <template v-if="field.widgetId === 'TextAreaEditor' || field.widgetId === 'RichTextEditor'">
    <textarea v-bind="bind" :placeholder="entry ? '' : field.defaultValue || ''" :required="required" :maxlength="maxlength" />
  </template>
  <template v-else-if="field.widgetId === 'BooleanSelectEditor'">
    <select v-bind="bind" :required="required">
      <option value="">{{ t('fieldInput.select') }}</option>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  </template>
  <template v-else-if="field.widgetId === 'EnumSelectEditor'">
    <select v-bind="bind" :required="required">
      <option value="">{{ t('fieldInput.select') }}</option>
      <option v-for="(v, i) in field.inValues || []" :key="i" :value="v.value">{{ v.value }}</option>
    </select>
  </template>
  <template v-else-if="field.widgetId === 'DatePickerEditor'">
    <input v-bind="bind" type="date" :required="required" :min="field.minInclusive || undefined" :max="field.maxInclusive || undefined" />
  </template>
  <template v-else-if="field.widgetId === 'DateTimePickerEditor'">
    <div v-if="entry" class="form-preview__datetime">
      <input
        type="date"
        :class="{ 'is-invalid': invalid }"
        :value="dtDate"
        :required="required"
        :min="field.minInclusive || undefined"
        :max="field.maxInclusive || undefined"
        @input="setDateTime(($event.target as HTMLInputElement).value, dtTime)"
      />
      <input
        type="time"
        step="1"
        :class="{ 'is-invalid': invalid }"
        :value="dtTime"
        @input="setDateTime(dtDate, ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div v-else class="form-preview__datetime">
      <input type="date" :required="required" :min="field.minInclusive || undefined" :max="field.maxInclusive || undefined" />
      <input type="time" />
    </div>
  </template>
  <template v-else-if="field.widgetId === 'NumberFieldEditor'">
    <input
      v-bind="bind"
      type="number"
      :required="required"
      :step="numStep"
      :min="field.minInclusive || undefined"
      :max="field.maxInclusive || undefined"
    />
  </template>
  <template v-else-if="isLookup && entry">
    <LookupInput :field="field" :entry="entry" :invalid="invalid" />
  </template>
  <template v-else-if="isReference">
    <input
      v-bind="bind"
      type="text"
      class="mono"
      :required="required"
      :placeholder="refPlaceholder"
    />
  </template>
  <template v-else>
    <input
      v-bind="bind"
      type="text"
      :placeholder="entry ? '' : field.defaultValue || ''"
      :required="required"
      :maxlength="maxlength"
      :minlength="minlength"
      :pattern="pattern"
    />
  </template>
</template>
