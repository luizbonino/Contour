<script setup lang="ts">
import { computed } from 'vue';
import { newId } from '../data';
import { fieldFromWidget } from '../composables/useSchema';
import { useDrag } from '../composables/useDrag';
import type { Mutator, Schema, SelectedKind } from '../types';
import Icon from './Icon.vue';
import FieldCard from './FieldCard.vue';

interface Props {
  schema: Schema;
  selectedKind: SelectedKind;
  selectedId: string | null;
  mutate: (m: Mutator) => void;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  selectField: [id: string | null];
  selectGroup: [id: string];
  selectSchema: [];
}>();

const { state: dragState, startFieldDrag, endDrag, setHover } = useDrag();

const totalFields = computed(() =>
  props.schema.groups.reduce((s, g) => s + g.fields.length, 0),
);

function onDragOverField(
  e: DragEvent,
  groupId: string,
  fieldId: string,
) {
  if (!dragState.payload) return;
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  const position = e.clientY < mid ? 'before' : 'after';
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect =
      dragState.payload.type === 'palette' ? 'copy' : 'move';
  }
  setHover({ groupId, fieldId, position });
}

function onDragOverGroup(e: DragEvent, groupId: string) {
  if (!dragState.payload) return;
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect =
      dragState.payload.type === 'palette' ? 'copy' : 'move';
  }
  setHover({ groupId, fieldId: null, position: 'end' });
}

function onDrop(e: DragEvent, targetGroupId: string) {
  e.preventDefault();
  e.stopPropagation();
  const target = dragState.hover;
  const dr = dragState.payload;
  if (!dr) {
    endDrag();
    return;
  }

  let newFieldId: string | null = null;

  props.mutate((draft) => {
    let movedField: ReturnType<typeof fieldFromWidget> | null = null;
    if (dr.type === 'field') {
      for (const g of draft.groups) {
        const idx = g.fields.findIndex((f) => f.id === dr.fieldId);
        if (idx >= 0) {
          movedField = g.fields.splice(idx, 1)[0];
          break;
        }
      }
    } else {
      movedField = fieldFromWidget(dr.widget, 0);
    }
    if (!movedField) return;

    const destGroupId = (target && target.groupId) || targetGroupId;
    const destGroup =
      draft.groups.find((g) => g.id === destGroupId) ||
      draft.groups[draft.groups.length - 1];
    if (!destGroup) return;

    if (target && target.fieldId) {
      const idx = destGroup.fields.findIndex((f) => f.id === target.fieldId);
      const insertAt = target.position === 'after' ? idx + 1 : idx;
      destGroup.fields.splice(insertAt, 0, movedField);
    } else {
      destGroup.fields.push(movedField);
    }
    destGroup.fields.forEach((f, i) => {
      f.order = i;
    });
    newFieldId = movedField.id;
  });

  if (dr.type === 'palette' && newFieldId) {
    emit('selectField', newFieldId);
  } else if (dr.type === 'field') {
    emit('selectField', dr.fieldId);
  }
  endDrag();
}

function addGroup() {
  props.mutate((draft) => {
    const order = draft.groups.length;
    draft.groups.push({
      id: newId('g'),
      label: `Section ${order + 1}`,
      order,
      fields: [],
    });
  });
}

function renameGroup(gid: string, label: string) {
  props.mutate((draft) => {
    const g = draft.groups.find((x) => x.id === gid);
    if (g) g.label = label;
  });
}

function deleteGroup(gid: string) {
  props.mutate((draft) => {
    const idx = draft.groups.findIndex((x) => x.id === gid);
    if (idx >= 0) draft.groups.splice(idx, 1);
    draft.groups.forEach((g, i) => {
      g.order = i;
    });
  });
}

function deleteField(gid: string, fid: string) {
  props.mutate((draft) => {
    const g = draft.groups.find((x) => x.id === gid);
    if (!g) return;
    g.fields = g.fields.filter((f) => f.id !== fid);
    g.fields.forEach((f, i) => {
      f.order = i;
    });
  });
}

function duplicateField(gid: string, fid: string) {
  props.mutate((draft) => {
    const g = draft.groups.find((x) => x.id === gid);
    if (!g) return;
    const i = g.fields.findIndex((f) => f.id === fid);
    if (i < 0) return;
    const copy = JSON.parse(JSON.stringify(g.fields[i]));
    copy.id = newId('f');
    copy.name = copy.name + ' (copy)';
    g.fields.splice(i + 1, 0, copy);
    g.fields.forEach((f, k) => {
      f.order = k;
    });
  });
}

function isFieldDragging(id: string): boolean {
  return (
    dragState.payload?.type === 'field' && dragState.payload.fieldId === id
  );
}

function showBeforeIndicator(gid: string, fid: string): boolean {
  const h = dragState.hover;
  return (
    !!h && h.groupId === gid && h.fieldId === fid && h.position === 'before'
  );
}

function showAfterIndicator(gid: string, fid: string): boolean {
  const h = dragState.hover;
  return !!h && h.groupId === gid && h.fieldId === fid && h.position === 'after';
}

function showEndIndicator(gid: string, fieldsLen: number): boolean {
  const h = dragState.hover;
  return (
    !!h && h.groupId === gid && h.fieldId === null && fieldsLen > 0
  );
}

function onCanvasClick() {
  emit('selectField', null);
}
</script>

<template>
  <div class="panel canvas">
    <div class="panel__header">
      <div>
        <div class="panel__title">Form canvas</div>
        <div class="panel__subtitle">
          {{ totalFields }}
          {{ totalFields === 1 ? 'property' : 'properties' }} in
          {{ schema.groups.length }}
          {{ schema.groups.length === 1 ? 'group' : 'groups' }}
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" @click="addGroup">
        <Icon name="plus" :size="13" /> Add group
      </button>
    </div>
    <div class="panel__body panel__body--snug">
      <div class="canvas__inner" @click="onCanvasClick">
        <!-- Schema banner -->
        <div
          class="target-banner"
          :class="{ 'is-selected': selectedKind === 'schema' }"
          @click.stop="emit('selectSchema')"
        >
          <div class="target-banner__main">
            <div class="target-banner__icon"><Icon name="layers" :size="18" /></div>
            <div style="min-width: 0">
              <div class="target-banner__name">
                {{ schema.schemaName || 'Untitled schema' }}
              </div>
              <div class="target-banner__sub">
                sh:NodeShape · sh:targetClass {{ schema.targetClass || '?' }}
              </div>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" @click.stop="emit('selectSchema')">
            <Icon name="gear" :size="13" /> Schema settings
          </button>
        </div>

        <div
          v-if="schema.groups.length === 0 && totalFields === 0"
          class="canvas-empty"
        >
          <div class="canvas-empty__icon"><Icon name="wand" :size="36" /></div>
          <div class="canvas-empty__title">Drop widgets here to design your form</div>
          <div class="canvas-empty__sub">
            Drag any widget from the left panel onto this canvas.
          </div>
        </div>

        <div v-for="g in schema.groups" :key="g.id" class="group-card">
          <div class="group-card__header" @click.stop="emit('selectGroup', g.id)">
            <Icon name="layers" :size="14" />
            <input
              class="group-card__title"
              :value="g.label"
              @input="renameGroup(g.id, ($event.target as HTMLInputElement).value)"
              @click.stop
            />
            <div class="group-card__actions">
              <button
                class="btn btn-danger-ghost btn-xs"
                title="Delete group"
                @click.stop="deleteGroup(g.id)"
              >
                <Icon name="trash" :size="13" />
              </button>
            </div>
          </div>
          <div
            class="group-card__body"
            @dragover="onDragOverGroup($event, g.id)"
            @drop="onDrop($event, g.id)"
          >
            <div v-if="g.fields.length === 0" class="group-card__drop-here">
              Drop a widget here
            </div>
            <template v-for="f in g.fields" :key="f.id">
              <div v-if="showBeforeIndicator(g.id, f.id)" class="drop-indicator" />
              <div
                @dragover="onDragOverField($event, g.id, f.id)"
                @drop="onDrop($event, g.id)"
              >
                <FieldCard
                  :field="f"
                  :is-selected="selectedKind === 'field' && selectedId === f.id"
                  :is-dragging="isFieldDragging(f.id)"
                  @select="emit('selectField', f.id)"
                  @delete="deleteField(g.id, f.id)"
                  @duplicate="duplicateField(g.id, f.id)"
                  @dragstart="(e) => startFieldDrag(e, f.id, g.id)"
                  @dragend="endDrag"
                />
              </div>
              <div v-if="showAfterIndicator(g.id, f.id)" class="drop-indicator" />
            </template>
            <div
              v-if="showEndIndicator(g.id, g.fields.length)"
              class="drop-indicator"
            />
          </div>
        </div>

        <div class="canvas-add-group">
          <button class="btn btn-ghost btn-sm" @click="addGroup">
            <Icon name="plus" :size="13" /> Add another group
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
