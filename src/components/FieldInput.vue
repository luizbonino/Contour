<script setup lang="ts">
import type { Field } from '../types';
import { useI18n } from '../composables/useI18n';

defineProps<{ field: Field }>();
const { t } = useI18n();
</script>

<template>
  <template v-if="field.widgetId === 'TextAreaEditor' || field.widgetId === 'RichTextEditor'">
    <textarea :placeholder="field.defaultValue || ''" />
  </template>
  <template v-else-if="field.widgetId === 'BooleanSelectEditor'">
    <select>
      <option value="">{{ t('fieldInput.select') }}</option>
      <option>true</option>
      <option>false</option>
    </select>
  </template>
  <template v-else-if="field.widgetId === 'EnumSelectEditor'">
    <select>
      <option value="">{{ t('fieldInput.select') }}</option>
      <option v-for="(v, i) in field.inValues || []" :key="i">{{ v }}</option>
    </select>
  </template>
  <template v-else-if="field.widgetId === 'DatePickerEditor'">
    <input type="date" />
  </template>
  <template v-else-if="field.widgetId === 'DateTimePickerEditor'">
    <div class="form-preview__datetime">
      <input type="date" />
      <input type="time" />
    </div>
  </template>
  <template v-else-if="field.widgetId === 'NumberFieldEditor'">
    <input type="number" />
  </template>
  <template
    v-else-if="
      field.widgetId === 'URIEditor' ||
      field.widgetId === 'AutoCompleteEditor' ||
      field.widgetId === 'InstancesSelectEditor'
    "
  >
    <input
      type="text"
      class="mono"
      :placeholder="field.widgetId === 'AutoCompleteEditor' ? t('fieldInput.search') : 'http://…'"
    />
  </template>
  <template v-else>
    <input type="text" :placeholder="field.defaultValue || ''" />
  </template>
</template>
