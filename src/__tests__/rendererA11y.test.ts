import { describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import FieldInput from '@fairdatateam/record-core/components/FieldInput.vue';
import PreviewField from '@fairdatateam/record-core/components/PreviewField.vue';
import type { Field, Schema } from '@fairdatateam/record-core/types';

const field = (widgetId: string, name: string): Field =>
  ({ id: name, widgetId, name, description: '', path: `ex:${name}`, order: 0, nodeKind: null, datatype: 'xsd:string', class: null, node: null, minCount: 1, maxCount: 1, minLength: null, maxLength: null }) as Field;
const schema = { nestedShapes: [] } as unknown as Schema;

describe('the shared renderer, for assistive technology', () => {
  it.each(['TextFieldEditor', 'TextAreaEditor', 'BooleanSelectEditor', 'DatePickerEditor', 'DateTimePickerEditor', 'NumberFieldEditor', 'URIEditor'])(
    'names every %s control by the field label',
    (widget) => {
      const w = mount(PreviewField, { props: { field: field(widget, 'Title'), schema } });
      const id = w.find('label').attributes('id');
      expect(id).toBeTruthy();
      const controls = w.findAll('.form-preview__value-input input, .form-preview__value-input select, .form-preview__value-input textarea');
      expect(controls.length).toBeGreaterThan(0);
      for (const c of controls) expect(c.attributes('aria-labelledby')).toBe(id);
    },
  );

  it('gives each field of a form its own label id', () => {
    const Form = defineComponent({
      components: { PreviewField },
      setup: () => ({ a: field('TextFieldEditor', 'A'), b: field('TextFieldEditor', 'B'), schema }),
      template: '<div><PreviewField :field="a" :schema="schema" /><PreviewField :field="b" :schema="schema" /></div>',
    });
    const ids = mount(Form).findAll('label').map((l) => l.attributes('id'));
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('marks an invalid value for assistive technology', () => {
    const entry = { value: 'x', lang: '' } as never;
    const ok = mount(FieldInput, { props: { field: field('TextFieldEditor', 'T'), entry } });
    const bad = mount(FieldInput, { props: { field: field('TextFieldEditor', 'T'), entry, invalid: true } });
    expect(ok.find('input').attributes('aria-invalid')).toBeUndefined();
    expect(bad.find('input').attributes('aria-invalid')).toBe('true');
  });
});
