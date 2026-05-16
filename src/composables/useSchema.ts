import { reactive, readonly, toRaw } from 'vue';
import { SEED_SCHEMA, newId } from '../data';
import type { Field, Mutator, Schema, Widget } from '../types';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const _schema = reactive<Schema>(deepClone(SEED_SCHEMA));

export function fieldFromWidget(widget: Widget, order = 0): Field {
  const f: Field = {
    id: newId('f'),
    widgetId: widget.id,
    name: widget.name,
    description: '',
    // Default path: local name derived from widget name; user is expected to replace it.
    path: ':' + widget.name.toLowerCase().replace(/[^a-z0-9]+/g, ''),
    order,
    nodeKind: widget.defaults.nodeKind ?? null,
    datatype: widget.defaults.datatype ?? null,
    class: widget.defaults.class ?? null,
    node: null,
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
    // Clone → mutate → assign: keeps _schema reactive while giving callers
    // a plain-object draft they can freely modify without Vue tracking overhead.
    const draft = deepClone(toRaw(_schema));
    mut(draft);
    Object.assign(_schema, draft);
  }

  return {
    schema: readonly(_schema) as unknown as Schema,
    mutate,
  };
}
