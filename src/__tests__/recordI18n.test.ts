import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import FieldInput from '@fairdatateam/record-core/components/FieldInput.vue';
import { RECORD_I18N, RECORD_MESSAGES_EN } from '@fairdatateam/record-core/i18n';
import type { Field } from '@fairdatateam/record-core/types';
import { setLocale, useI18n } from '../composables/useI18n';
import { messages } from '../i18n';

const boolField = { id: 'f', widgetId: 'BooleanSelectEditor', name: 'Flag', description: '', path: 'ex:flag', order: 0, nodeKind: null, datatype: 'xsd:boolean', class: null, node: null, minCount: null, maxCount: null, minLength: null, maxLength: null } as Field;

const resolve = (dict: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict);

describe("the shared renderer through Contour's i18n", () => {
  afterEach(() => setLocale('en'));

  it('follows the language switch', async () => {
    const { t } = useI18n();
    setLocale('en');
    const w = mount(FieldInput, { props: { field: boolField }, global: { provide: { [RECORD_I18N as symbol]: { t } } } });
    expect(w.find('option').text()).toBe('— select —');
    setLocale('nl-NL');
    await nextTick();
    expect(w.find('option').text()).toBe('— selecteren —');
  });

  it("keeps the package's English defaults equal to Contour's English messages", () => {
    for (const [key, value] of Object.entries(RECORD_MESSAGES_EN)) expect(resolve(messages.en, key), key).toBe(value);
  });
});
