import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Inspector from '../components/Inspector.vue';
import type { Schema } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function schema(overrides: Partial<Schema> = {}): Schema {
  return {
    schemaName: 'My Schema',
    schemaDescription: '',
    shapeIri: ':Shape',
    targetClass: ':Thing',
    prefixes: [],
    groups: [
      {
        id: 'g1',
        label: 'General',
        order: 0,
        fields: [
          {
            id: 'f1',
            widgetId: 'TextFieldEditor',
            name: 'Title',
            description: '',
            path: 'dct:title',
            order: 0,
            nodeKind: 'sh:Literal',
            datatype: 'xsd:string',
            class: null,
            node: null,
            minCount: null,
            maxCount: null,
            minLength: null,
            maxLength: null,
            pattern: '',
            defaultValue: '',
            inValues: null,
          },
        ],
      },
    ],
    nestedShapes: [
      {
        id: 'ns1',
        iri: ':AgentShape',
        targetClass: ':Agent',
        fields: [
          {
            id: 'nf1',
            widgetId: 'TextFieldEditor',
            name: 'Agent Name',
            description: '',
            path: ':name',
            order: 0,
            nodeKind: 'sh:Literal',
            datatype: 'xsd:string',
            class: null,
            node: null,
            minCount: null,
            maxCount: null,
            minLength: null,
            maxLength: null,
            pattern: '',
            defaultValue: '',
            inValues: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function mountInspector(props: Record<string, unknown>) {
  return mount(Inspector, {
    props: {
      schema: schema(),
      selectedKind: 'schema',
      selectedId: null,
      selectedNestedShapeId: null,
      mutate: vi.fn(),
      ...props,
    },
    global: {
      stubs: {
        // Stub child components that have complex deps
        PrefixEditor: { template: '<div class="stub-prefix-editor" />' },
        InValuesEditor: { template: '<div class="stub-invals-editor" />' },
        Icon: { template: '<span />' },
        WidgetIcon: { template: '<span />' },
      },
    },
  });
}

// ── Section visibility ─────────────────────────────────────────────────────────

// Helper: collect the current value of every <input type="text"> in the wrapper.
function inputValues(w: ReturnType<typeof mountInspector>): string[] {
  return w.findAll('input[type="text"]').map((i) => (i.element as HTMLInputElement).value);
}

describe('Inspector – section visibility', () => {
  it('shows schema section by default (selectedKind = schema)', () => {
    const w = mountInspector({ selectedKind: 'schema' });
    expect(w.text()).toContain('Schema settings');
    // schemaName is bound to an input value, not text content
    expect(inputValues(w)).toContain('My Schema');
  });

  it('shows field section when selectedKind = field', () => {
    const w = mountInspector({ selectedKind: 'field', selectedId: 'f1' });
    expect(w.text()).toContain('Property settings');
    // field name "Title" is bound to an input value
    expect(inputValues(w)).toContain('Title');
  });

  it('shows group section when selectedKind = group', () => {
    const w = mountInspector({ selectedKind: 'group', selectedId: 'g1' });
    expect(w.text()).toContain('Group settings');
    // group label "General" is bound to an input value
    expect(inputValues(w)).toContain('General');
  });

  it('shows nested-shape section when selectedKind = nested-shape', () => {
    const w = mountInspector({ selectedKind: 'nested-shape', selectedNestedShapeId: 'ns1' });
    expect(w.text()).toContain('Nested shape settings');
    // IRI and targetClass are in input values
    expect(inputValues(w)).toContain(':AgentShape');
    expect(inputValues(w)).toContain(':Agent');
  });

  it('shows nested-field section when selectedKind = nested-field', () => {
    const w = mountInspector({
      selectedKind: 'nested-field',
      selectedId: 'nf1',
      selectedNestedShapeId: 'ns1',
    });
    expect(w.text()).toContain('Nested field settings');
    // field name is bound to an input value
    expect(inputValues(w)).toContain('Agent Name');
  });
});

// ── Close button visibility ────────────────────────────────────────────────────

describe('Inspector – close button', () => {
  it('hides close button on schema section', () => {
    const w = mountInspector({ selectedKind: 'schema' });
    expect(w.find('button.btn-ghost.btn-xs').exists()).toBe(false);
  });

  it('shows close button on field section', () => {
    const w = mountInspector({ selectedKind: 'field', selectedId: 'f1' });
    expect(w.find('button.btn-ghost.btn-xs').exists()).toBe(true);
  });

  it('shows close button on group section', () => {
    const w = mountInspector({ selectedKind: 'group', selectedId: 'g1' });
    expect(w.find('button.btn-ghost.btn-xs').exists()).toBe(true);
  });

  it('shows close button on nested-shape section', () => {
    const w = mountInspector({ selectedKind: 'nested-shape', selectedNestedShapeId: 'ns1' });
    expect(w.find('button.btn-ghost.btn-xs').exists()).toBe(true);
  });

  it('emits clear when close button is clicked', async () => {
    const w = mountInspector({ selectedKind: 'field', selectedId: 'f1' });
    await w.find('button.btn-ghost.btn-xs').trigger('click');
    expect(w.emitted('clear')).toBeTruthy();
  });
});

// ── Mutations ──────────────────────────────────────────────────────────────────

describe('Inspector – mutations', () => {
  it('calls mutate when field name is changed', async () => {
    const mutate = vi.fn();
    const w = mountInspector({ selectedKind: 'field', selectedId: 'f1', mutate });
    const inputs = w.findAll('input[type="text"]');
    // First text input in the field section is the name
    await inputs[0].setValue('New Title');
    expect(mutate).toHaveBeenCalled();
  });

  it('calls mutate when group label is changed', async () => {
    const mutate = vi.fn();
    const w = mountInspector({ selectedKind: 'group', selectedId: 'g1', mutate });
    const input = w.find('input[type="text"]');
    await input.setValue('Renamed Group');
    expect(mutate).toHaveBeenCalled();
  });

  it('calls mutate when schema name is changed', async () => {
    const mutate = vi.fn();
    const w = mountInspector({ selectedKind: 'schema', mutate });
    const input = w.find('input[type="text"]');
    await input.setValue('Updated Schema');
    expect(mutate).toHaveBeenCalled();
  });

  it('calls mutate when nested shape IRI is changed', async () => {
    const mutate = vi.fn();
    const w = mountInspector({ selectedKind: 'nested-shape', selectedNestedShapeId: 'ns1', mutate });
    const iriInput = w.find('input.mono');
    await iriInput.setValue(':RenamedShape');
    expect(mutate).toHaveBeenCalled();
  });

  it('calls mutate when nested field path is changed', async () => {
    const mutate = vi.fn();
    const w = mountInspector({
      selectedKind: 'nested-field',
      selectedId: 'nf1',
      selectedNestedShapeId: 'ns1',
      mutate,
    });
    // path input is the mono-class one
    const pathInput = w.find('input.mono');
    await pathInput.setValue(':newpath');
    expect(mutate).toHaveBeenCalled();
  });

  it('emits clear and calls mutate when delete nested shape is clicked', async () => {
    const mutate = vi.fn();
    const w = mountInspector({ selectedKind: 'nested-shape', selectedNestedShapeId: 'ns1', mutate });
    const deleteBtn = w.find('button.btn-danger-ghost');
    await deleteBtn.trigger('click');
    expect(mutate).toHaveBeenCalled();
    expect(w.emitted('clear')).toBeTruthy();
  });

  it('emits clear and calls mutate when delete group is clicked', async () => {
    const mutate = vi.fn();
    const w = mountInspector({ selectedKind: 'group', selectedId: 'g1', mutate });
    const deleteBtn = w.find('button.btn-danger-ghost');
    await deleteBtn.trigger('click');
    expect(mutate).toHaveBeenCalled();
    expect(w.emitted('clear')).toBeTruthy();
  });
});

// ── Nested shape: datalist for sh:node ────────────────────────────────────────

describe('Inspector – DetailsEditor sh:node datalist', () => {
  it('shows datalist options for existing nested shapes on DetailsEditor field', () => {
    const s = schema({
      groups: [{
        id: 'g1',
        label: 'G',
        order: 0,
        fields: [{
          id: 'fd1',
          widgetId: 'DetailsEditor',
          name: 'Agent',
          description: '',
          path: ':agent',
          order: 0,
          nodeKind: 'sh:BlankNodeOrIRI',
          datatype: null,
          class: null,
          node: ':AgentShape',
          minCount: null,
          maxCount: null,
          minLength: null,
          maxLength: null,
          pattern: '',
          defaultValue: '',
          inValues: null,
        }],
      }],
    });
    const w = mount(Inspector, {
      props: {
        schema: s,
        selectedKind: 'field',
        selectedId: 'fd1',
        selectedNestedShapeId: null,
        mutate: vi.fn(),
      },
      global: {
        stubs: {
          PrefixEditor: { template: '<div />' },
          InValuesEditor: { template: '<div />' },
          Icon: { template: '<span />' },
          WidgetIcon: { template: '<span />' },
        },
      },
    });
    const datalist = w.find('datalist#nested-shape-iris');
    expect(datalist.exists()).toBe(true);
    const options = datalist.findAll('option');
    expect(options).toHaveLength(1);
    expect(options[0].attributes('value')).toBe(':AgentShape');
  });
});

// ── Subtitle ──────────────────────────────────────────────────────────────────

describe('Inspector – subtitle text', () => {
  const cases: [string, Partial<Parameters<typeof mountInspector>[0]>][] = [
    ['Schema settings',         { selectedKind: 'schema' }],
    ['Property settings',       { selectedKind: 'field', selectedId: 'f1' }],
    ['Group settings',          { selectedKind: 'group', selectedId: 'g1' }],
    ['Nested shape settings',   { selectedKind: 'nested-shape', selectedNestedShapeId: 'ns1' }],
    ['Nested field settings',   { selectedKind: 'nested-field', selectedId: 'nf1', selectedNestedShapeId: 'ns1' }],
  ];
  for (const [label, props] of cases) {
    it(`shows "${label}" subtitle`, () => {
      const w = mountInspector(props);
      expect(w.text()).toContain(label);
    });
  }
});
