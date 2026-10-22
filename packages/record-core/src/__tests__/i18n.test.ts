import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FieldInput from '../components/FieldInput.vue';
import { RECORD_I18N, translateEn } from '../i18n';
import type { Field } from '../types';

const boolField = { id: 'f', widgetId: 'BooleanSelectEditor', name: 'Flag', description: '', path: 'ex:flag', order: 0, nodeKind: null, datatype: 'xsd:boolean', class: null, node: null, minCount: null, maxCount: null, minLength: null, maxLength: null } as Field;

describe('renderer i18n', () => {
  it('falls back to English without a provider', () => {
    expect(mount(FieldInput, { props: { field: boolField } }).find('option').text()).toBe('— select —');
  });

  it('uses the host translator when one is provided', () => {
    const t = (key: string) => `<<${key}>>`;
    const w = mount(FieldInput, { props: { field: boolField }, global: { provide: { [RECORD_I18N as symbol]: { t } } } });
    expect(w.find('option').text()).toBe('<<fieldInput.select>>');
  });

  it('interpolates parameters in the English defaults and passes unknown keys through', () => {
    expect(translateEn('fieldInput.searchClass', { class: 'foaf:Agent' })).toBe('Search foaf:Agent instances…');
    expect(translateEn('no.such.key')).toBe('no.such.key');
  });
});
