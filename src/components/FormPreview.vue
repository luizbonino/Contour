<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { Field, NestedShape, Schema } from '../types';
import { useI18n } from '../composables/useI18n';
import FieldInput from './FieldInput.vue';
import Icon from './Icon.vue';

const { t } = useI18n();

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

const valueCounts = reactive<Record<string, number>>({});
const openTooltipId = ref<string | null>(null);

function toggleTooltip(id: string): void {
  openTooltipId.value = openTooltipId.value === id ? null : id;
}

function getCount(fieldId: string): number {
  return valueCounts[fieldId] ?? 1;
}
function addValue(fieldId: string): void {
  valueCounts[fieldId] = getCount(fieldId) + 1;
}
function removeValue(fieldId: string): void {
  const c = getCount(fieldId);
  if (c > 1) valueCounts[fieldId] = c - 1;
}

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

function getNestedShape(nodeIri: string | null | undefined): NestedShape | null {
  if (!nodeIri) return null;
  return (props.schema.nestedShapes || []).find((ns) => ns.iri === nodeIri) ?? null;
}

function sortedNestedFields(nodeIri: string | null | undefined): Field[] {
  return (getNestedShape(nodeIri)?.fields || []).slice().sort((a, b) => a.order - b.order);
}
</script>

<template>
  <div class="form-preview">
    <div
      v-if="sortedGroups.length === 0"
      style="color: var(--color-text-lighter); text-align: center; padding: 30px"
    >
      {{ t('formPreview.empty') }}
    </div>
    <div v-for="g in sortedGroups" :key="g.id">
      <div class="form-preview__group-title">{{ g.label }}</div>
      <div v-for="f in g.fields" :key="f.id" class="form-row">
        <div class="form-preview__label-row">
          <label :class="{ required: isRequired(f) }">{{ f.name || labelFromPath(f.path) }}</label>
          <button
            v-if="f.description"
            class="form-preview__info-btn"
            type="button"
            :class="{ 'is-open': openTooltipId === f.id }"
            @click.stop="toggleTooltip(f.id)"
          >
            <Icon name="info" :size="13" />
            <span class="form-preview__tooltip">{{ f.description }}</span>
          </button>
        </div>

        <!-- DetailsEditor: render the nested shape's fields inline -->
        <template v-if="f.widgetId === 'DetailsEditor'">
          <div v-if="getNestedShape(f.node)" class="form-preview__nested-form">
            <div
              v-for="nf in sortedNestedFields(f.node)"
              :key="nf.id"
              class="form-preview__nested-row"
            >
              <div class="form-preview__label-row">
                <label :class="{ required: isRequired(nf) }">{{ nf.name || labelFromPath(nf.path) }}</label>
                <button
                  v-if="nf.description"
                  class="form-preview__info-btn"
                  type="button"
                  :class="{ 'is-open': openTooltipId === nf.id }"
                  @click.stop="toggleTooltip(nf.id)"
                >
                  <Icon name="info" :size="13" />
                  <span class="form-preview__tooltip">{{ nf.description }}</span>
                </button>
              </div>
              <div v-for="idx in getCount(nf.id)" :key="idx" class="form-preview__value-row">
                <div class="form-preview__value-input">
                  <FieldInput :field="nf" />
                </div>
                <button
                  v-if="isMulti(nf) && getCount(nf.id) > 1"
                  class="form-preview__remove-btn"
                  type="button"
                  :title="t('formPreview.removeValue')"
                  @click="removeValue(nf.id)"
                >×</button>
              </div>
              <button
                v-if="isMulti(nf)"
                class="form-preview__add-btn"
                type="button"
                @click="addValue(nf.id)"
              >{{ t('formPreview.add') }}</button>
            </div>
          </div>
          <div v-else class="form-preview__nested">
            ▢ {{ f.node ? t('formPreview.nestedSubform', { iri: f.node }) : t('formPreview.nestedSubformGeneric') }}
          </div>
        </template>

        <!-- All other widgets -->
        <template v-else>
          <div v-for="idx in getCount(f.id)" :key="idx" class="form-preview__value-row">
            <div class="form-preview__value-input">
              <FieldInput :field="f" />
            </div>
            <button
              v-if="isMulti(f) && getCount(f.id) > 1"
              class="form-preview__remove-btn"
              type="button"
              :title="t('formPreview.removeValue')"
              @click="removeValue(f.id)"
            >×</button>
          </div>
          <button
            v-if="isMulti(f)"
            class="form-preview__add-btn"
            type="button"
            @click="addValue(f.id)"
          >{{ t('formPreview.add') }}</button>
        </template>
      </div>
    </div>
  </div>
</template>
