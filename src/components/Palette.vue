<script setup lang="ts">
import { computed, ref } from 'vue';
import { WIDGETS } from '../data';
import { useDrag } from '../composables/useDrag';
import type { Widget } from '../types';
import Icon from './Icon.vue';
import WidgetIcon from './WidgetIcon.vue';

const q = ref('');
const { startPaletteDrag, endDrag } = useDrag();

const filtered = computed<Widget[]>(() => {
  const needle = q.value.trim().toLowerCase();
  if (!needle) return WIDGETS;
  return WIDGETS.filter(
    (w) =>
      w.name.toLowerCase().includes(needle) ||
      w.desc.toLowerCase().includes(needle) ||
      w.editor.toLowerCase().includes(needle),
  );
});

const byCategory = computed<Array<[string, Widget[]]>>(() => {
  const m = new Map<string, Widget[]>();
  for (const w of filtered.value) {
    if (!m.has(w.category)) m.set(w.category, []);
    m.get(w.category)!.push(w);
  }
  return [...m.entries()];
});

function onDragStart(e: DragEvent, widget: Widget) {
  startPaletteDrag(e, widget);
}
</script>

<template>
  <div class="panel">
    <div class="panel__header">
      <div>
        <div class="panel__title">Widgets</div>
        <div class="panel__subtitle">Drag to canvas · DASH</div>
      </div>
    </div>
    <div class="palette-search">
      <Icon name="search" :size="14" />
      <input v-model="q" placeholder="Search widgets…" />
    </div>
    <div class="panel__body panel__body--snug" style="padding-top: 8px">
      <div v-for="[cat, items] in byCategory" :key="cat" class="palette-cat">
        <div class="palette-cat__label">{{ cat }}</div>
        <div
          v-for="w in items"
          :key="w.id"
          class="palette-item"
          draggable="true"
          :title="w.editor"
          @dragstart="onDragStart($event, w)"
          @dragend="endDrag"
        >
          <div class="palette-item__icon"><WidgetIcon :char="w.icon" /></div>
          <div class="palette-item__text">
            <div class="palette-item__name">{{ w.name }}</div>
            <div class="palette-item__desc">{{ w.desc }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
