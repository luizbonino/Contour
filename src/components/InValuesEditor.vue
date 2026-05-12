<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from './Icon.vue';

interface Props {
  values: string[] | null;
}
const props = defineProps<Props>();
const emit = defineEmits<{ change: [v: string[] | null] }>();

const input = ref('');
const items = computed<string[]>(() => props.values || []);

function addItem() {
  if (!input.value.trim()) return;
  emit('change', [...items.value, input.value.trim()]);
  input.value = '';
}

function removeItem(i: number) {
  const next = items.value.slice();
  next.splice(i, 1);
  emit('change', next.length ? next : null);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    addItem();
  }
}
</script>

<template>
  <div class="form-row">
    <label>Allowed values (sh:in)</label>
    <div class="tag-row">
      <span v-for="(v, i) in items" :key="i" class="tag">
        {{ v }}
        <button @click="removeItem(i)"><Icon name="x" :size="11" /></button>
      </span>
      <input
        v-model="input"
        placeholder="Add value + Enter"
        @keydown="onKey"
      />
    </div>
    <div class="hint">Press Enter to add. Stored as sh:in ( "a" "b" "c" ).</div>
  </div>
</template>
