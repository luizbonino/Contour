<script setup lang="ts">
import { computed } from 'vue';
import type { Field, Schema } from '../types';

interface Props {
  schema: Schema;
}
const props = defineProps<Props>();

const sortedGroups = computed(() =>
  props.schema.groups.slice().sort((a, b) => a.order - b.order),
);

function isRequired(f: Field): boolean {
  return (f.minCount || 0) > 0;
}
function isMulti(f: Field): boolean {
  return f.maxCount === null || f.maxCount === undefined || f.maxCount > 1;
}
</script>

<template>
  <div class="form-preview">
    <div
      v-if="sortedGroups.length === 0"
      style="color: var(--color-text-lighter); text-align: center; padding: 30px"
    >
      Add fields to see a live preview of the rendered form.
    </div>
    <div v-for="g in sortedGroups" :key="g.id">
      <div class="form-preview__group-title">{{ g.label }}</div>
      <div v-for="f in g.fields" :key="f.id" class="form-row">
        <label :class="{ required: isRequired(f) }">
          {{ f.name }}
          <span
            v-if="isMulti(f)"
            style="margin-left: 8px; font-size: 10px; color: var(--color-text-lighter); font-weight: 600"
          >
            (multiple)
          </span>
        </label>
        <template v-if="f.widgetId === 'TextAreaEditor' || f.widgetId === 'RichTextEditor'">
          <textarea :placeholder="f.defaultValue || ''" />
        </template>
        <template v-else-if="f.widgetId === 'BooleanSelectEditor'">
          <select>
            <option value="">— select —</option>
            <option>true</option>
            <option>false</option>
          </select>
        </template>
        <template v-else-if="f.widgetId === 'EnumSelectEditor'">
          <select>
            <option value="">— select —</option>
            <option v-for="(v, i) in f.inValues || []" :key="i">{{ v }}</option>
          </select>
        </template>
        <template v-else-if="f.widgetId === 'DatePickerEditor'">
          <input type="date" />
        </template>
        <template v-else-if="f.widgetId === 'DateTimePickerEditor'">
          <input type="datetime-local" />
        </template>
        <template v-else-if="f.widgetId === 'NumberFieldEditor'">
          <input type="number" />
        </template>
        <template
          v-else-if="
            f.widgetId === 'URIEditor' ||
            f.widgetId === 'AutoCompleteEditor' ||
            f.widgetId === 'InstancesSelectEditor'
          "
        >
          <input
            type="text"
            class="mono"
            :placeholder="f.widgetId === 'AutoCompleteEditor' ? 'Start typing to search…' : 'http://…'"
          />
        </template>
        <template v-else-if="f.widgetId === 'DetailsEditor'">
          <div class="form-preview__nested">
            ▢ Nested {{ f.class || f.path }} sub-form
          </div>
        </template>
        <template v-else>
          <input type="text" :placeholder="f.defaultValue || ''" />
        </template>
        <div v-if="f.description" class="hint">{{ f.description }}</div>
      </div>
    </div>
  </div>
</template>
