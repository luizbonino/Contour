import { reactive, readonly } from 'vue';
import { SEED_SCHEMA, newId } from '../data';
import type { Field, Mutator, Schema, Widget } from '../types';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const state = reactive<{ schema: Schema }>({
  schema: deepClone(SEED_SCHEMA),
});

export function fieldFromWidget(widget: Widget, order = 0): Field {
  const f: Field = {
    id: newId('f'),
    widgetId: widget.id,
    name: widget.name,
    description: '',
    path: ':' + widget.name.toLowerCase().replace(/[^a-z0-9]+/g, ''),
    order,
    nodeKind: widget.defaults.nodeKind ?? null,
    datatype: widget.defaults.datatype ?? null,
    class: widget.defaults.class ?? null,
    minCount: null,
    maxCount: null,
    minLength: null,
    maxLength: null,
    pattern: '',
    defaultValue: '',
    inValues: widget.defaults.inValues ? widget.defaults.inValues.slice() : null,
  };
  return f;
}

export function useSchemaStore() {
  function mutate(mut: Mutator) {
    const draft = deepClone(state.schema);
    mut(draft);
    state.schema = draft;
  }

  return {
    schema: readonly(state).schema as unknown as Schema,
    mutate,
  };
}
