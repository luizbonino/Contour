<script setup lang="ts">
import { computed } from 'vue';
import { DATATYPES, NODE_KINDS, WIDGET_BY_ID } from '../data';
import type { Field, Group, Mutator, Prefix, Schema, SelectedKind } from '../types';
import Icon from './Icon.vue';
import WidgetIcon from './WidgetIcon.vue';
import InValuesEditor from './InValuesEditor.vue';
import PrefixEditor from './PrefixEditor.vue';

interface Props {
  schema: Schema;
  selectedKind: SelectedKind;
  selectedId: string | null;
  mutate: (m: Mutator) => void;
}
const props = defineProps<Props>();
const emit = defineEmits<{ clear: [] }>();

interface FieldLocation {
  field: Field;
  group: Group;
}

const currentField = computed<FieldLocation | null>(() => {
  if (props.selectedKind !== 'field' || !props.selectedId) return null;
  for (const g of props.schema.groups) {
    const f = g.fields.find((x) => x.id === props.selectedId);
    if (f) return { field: f, group: g };
  }
  return null;
});

const currentGroup = computed<Group | null>(() => {
  if (props.selectedKind !== 'group' || !props.selectedId) return null;
  return props.schema.groups.find((g) => g.id === props.selectedId) || null;
});

const subtitle = computed(() => {
  if (props.selectedKind === 'field') return 'Property settings';
  if (props.selectedKind === 'group') return 'Group settings';
  return 'Schema settings';
});

const fieldWidget = computed(() =>
  currentField.value ? WIDGET_BY_ID[currentField.value.field.widgetId] : null,
);

const isLiteral = computed(
  () => (currentField.value?.field.nodeKind || '').includes('Literal'),
);
const isIRI = computed(
  () => (currentField.value?.field.nodeKind || '').includes('IRI'),
);

function setField<K extends keyof Field>(key: K, value: Field[K]) {
  const loc = currentField.value;
  if (!loc) return;
  props.mutate((draft) => {
    const g = draft.groups.find((x) => x.id === loc.group.id);
    if (!g) return;
    const i = g.fields.findIndex((f) => f.id === loc.field.id);
    if (i >= 0) (g.fields[i] as Field)[key] = value;
  });
}

function setGroup<K extends keyof Group>(key: K, value: Group[K]) {
  const grp = currentGroup.value;
  if (!grp) return;
  props.mutate((draft) => {
    const g = draft.groups.find((x) => x.id === grp.id);
    if (g) (g as Group)[key] = value;
  });
}

function deleteCurrentGroup() {
  const grp = currentGroup.value;
  if (!grp) return;
  props.mutate((draft) => {
    const i = draft.groups.findIndex((g) => g.id === grp.id);
    if (i >= 0) draft.groups.splice(i, 1);
  });
  emit('clear');
}

function setSchema<K extends keyof Schema>(key: K, value: Schema[K]) {
  props.mutate((draft) => {
    (draft as Schema)[key] = value;
  });
}

function onNumber(e: Event): number | null {
  const v = (e.target as HTMLInputElement).value;
  return v === '' ? null : Number(v);
}
</script>

<template>
  <div class="panel">
    <div class="panel__header">
      <div>
        <div class="panel__title">Inspector</div>
        <div class="panel__subtitle">{{ subtitle }}</div>
      </div>
      <button
        v-if="selectedKind === 'field' || selectedKind === 'group'"
        class="btn btn-ghost btn-xs"
        title="Back to schema"
        @click="emit('clear')"
      >
        <Icon name="x" :size="13" />
      </button>
    </div>
    <div class="panel__body panel__body--snug">
      <!-- FIELD INSPECTOR -->
      <div v-if="currentField && fieldWidget">
        <div class="field-head">
          <div class="field-head__icon"><WidgetIcon :char="fieldWidget.icon" /></div>
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 700; color: var(--color-text-dark)">
              {{ fieldWidget.name }}
            </div>
            <div class="field-head__editor">{{ fieldWidget.editor }}</div>
          </div>
        </div>

        <div class="insp-section">
          <div class="insp-section__title">Basic</div>
          <div class="form-row">
            <label class="required">Label (sh:name)</label>
            <input
              type="text"
              :value="currentField.field.name"
              @input="setField('name', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="form-row">
            <label>Description</label>
            <textarea
              :value="currentField.field.description"
              placeholder="Help text shown to the user"
              @input="setField('description', ($event.target as HTMLTextAreaElement).value)"
            />
          </div>
          <div class="form-row">
            <label class="required">Property path (sh:path)</label>
            <input
              type="text"
              class="mono"
              :value="currentField.field.path"
              placeholder="dct:title"
              @input="setField('path', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <div class="insp-section">
          <div class="insp-section__title">Constraints</div>
          <div class="form-row-2">
            <div class="form-row">
              <label>Min count</label>
              <input
                type="number"
                :value="currentField.field.minCount ?? ''"
                placeholder="0"
                min="0"
                @input="setField('minCount', onNumber($event))"
              />
            </div>
            <div class="form-row">
              <label>Max count</label>
              <input
                type="number"
                :value="currentField.field.maxCount ?? ''"
                placeholder="∞"
                min="1"
                @input="setField('maxCount', onNumber($event))"
              />
            </div>
          </div>
          <div class="form-row">
            <label>Node kind</label>
            <select
              :value="currentField.field.nodeKind || ''"
              @change="setField('nodeKind', (($event.target as HTMLSelectElement).value || null) as Field['nodeKind'])"
            >
              <option value="">— none —</option>
              <option v-for="o in NODE_KINDS" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>
          <div v-if="isLiteral" class="form-row">
            <label>Datatype</label>
            <select
              :value="currentField.field.datatype || ''"
              @change="setField('datatype', (($event.target as HTMLSelectElement).value || null))"
            >
              <option value="">— none —</option>
              <option v-for="o in DATATYPES" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>
          <div v-if="isIRI" class="form-row">
            <label>Class (sh:class)</label>
            <input
              type="text"
              class="mono"
              :value="currentField.field.class || ''"
              placeholder="foaf:Agent"
              @input="setField('class', ($event.target as HTMLInputElement).value || null)"
            />
          </div>
          <template v-if="isLiteral">
            <div class="form-row-2">
              <div class="form-row">
                <label>Min length</label>
                <input
                  type="number"
                  :value="currentField.field.minLength ?? ''"
                  placeholder="0"
                  min="0"
                  @input="setField('minLength', onNumber($event))"
                />
              </div>
              <div class="form-row">
                <label>Max length</label>
                <input
                  type="number"
                  :value="currentField.field.maxLength ?? ''"
                  placeholder="∞"
                  min="1"
                  @input="setField('maxLength', onNumber($event))"
                />
              </div>
            </div>
            <div class="form-row">
              <label>Pattern (regex)</label>
              <input
                type="text"
                class="mono"
                :value="currentField.field.pattern"
                placeholder="^[A-Z].*"
                @input="setField('pattern', ($event.target as HTMLInputElement).value)"
              />
            </div>
          </template>
          <InValuesEditor
            v-if="
              currentField.field.widgetId === 'EnumSelectEditor' ||
              (currentField.field.inValues && currentField.field.inValues.length > 0)
            "
            :values="currentField.field.inValues"
            @change="(v) => setField('inValues', v)"
          />
        </div>

        <div class="insp-section">
          <div class="insp-section__title">Defaults & order</div>
          <div class="form-row">
            <label>Default value</label>
            <input
              type="text"
              :value="currentField.field.defaultValue"
              placeholder="—"
              @input="setField('defaultValue', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="form-row">
            <label>Order (sh:order)</label>
            <input
              type="number"
              :value="currentField.field.order"
              min="0"
              @input="setField('order', Number(($event.target as HTMLInputElement).value))"
            />
          </div>
          <div class="form-row">
            <label>Group</label>
            <input type="text" disabled :value="currentField.group.label" />
            <div class="hint">Move the field by dragging it into another group.</div>
          </div>
        </div>
      </div>

      <!-- GROUP INSPECTOR -->
      <div v-else-if="currentGroup">
        <div class="field-head">
          <div class="field-head__icon"><Icon name="layers" :size="18" /></div>
          <div style="flex: 1">
            <div style="font-weight: 700; color: var(--color-text-dark)">Group</div>
            <div class="field-head__editor">sh:PropertyGroup</div>
          </div>
        </div>
        <div class="insp-section">
          <div class="insp-section__title">Properties</div>
          <div class="form-row">
            <label class="required">Label</label>
            <input
              type="text"
              :value="currentGroup.label"
              @input="setGroup('label', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="form-row">
            <label>Order</label>
            <input
              type="number"
              :value="currentGroup.order"
              min="0"
              @input="setGroup('order', Number(($event.target as HTMLInputElement).value))"
            />
          </div>
          <button class="btn btn-danger-ghost btn-sm" @click="deleteCurrentGroup">
            <Icon name="trash" :size="13" /> Delete group
          </button>
        </div>
      </div>

      <!-- SCHEMA INSPECTOR -->
      <div v-else>
        <div class="field-head">
          <div class="field-head__icon"><Icon name="layers" :size="18" /></div>
          <div>
            <div style="font-weight: 700; color: var(--color-text-dark)">
              Schema settings
            </div>
            <div class="field-head__editor">sh:NodeShape</div>
          </div>
        </div>
        <div class="insp-section">
          <div class="insp-section__title">Identity</div>
          <div class="form-row">
            <label class="required">Schema name</label>
            <input
              type="text"
              :value="schema.schemaName"
              @input="setSchema('schemaName', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="form-row">
            <label>Description</label>
            <textarea
              :value="schema.schemaDescription"
              @input="setSchema('schemaDescription', ($event.target as HTMLTextAreaElement).value)"
            />
          </div>
        </div>
        <div class="insp-section">
          <div class="insp-section__title">Shape definition</div>
          <div class="form-row">
            <label>Shape IRI</label>
            <input
              type="text"
              class="mono"
              :value="schema.shapeIri"
              placeholder=":DatasetShape"
              @input="setSchema('shapeIri', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="form-row">
            <label class="required">Target class (sh:targetClass)</label>
            <input
              type="text"
              class="mono"
              :value="schema.targetClass"
              placeholder="dcat:Dataset"
              @input="setSchema('targetClass', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
        <div class="insp-section">
          <div class="insp-section__title">Vocabularies</div>
          <PrefixEditor
            :prefixes="schema.prefixes"
            @change="(v: Prefix[]) => setSchema('prefixes', v)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
