// The DASH form widget catalogue and client-side ids. Shared by the SHACL
// bridge (dash:editor <-> widget), the form renderer and Contour's palette.
import type { InValue, Widget } from './types';

// Concise constructor for literal sh:in members in the static catalogue.
const lit = (value: string): InValue => ({ value, kind: 'literal' });

// All DASH form widgets from https://datashapes.org/forms.html
export const WIDGETS: Widget[] = [
  {
    id: 'TextFieldEditor',
    name: 'Text field',
    desc: 'Single-line text',
    category: 'Text',
    editor: 'dash:TextFieldEditor',
    icon: 'T',
    defaults: { nodeKind: 'sh:Literal', datatype: 'xsd:string' },
  },
  {
    id: 'TextAreaEditor',
    name: 'Text area',
    desc: 'Multi-line text',
    category: 'Text',
    editor: 'dash:TextAreaEditor',
    icon: '¶',
    defaults: { nodeKind: 'sh:Literal', datatype: 'xsd:string' },
  },
  {
    id: 'RichTextEditor',
    name: 'Rich text',
    desc: 'Formatted text with language tag',
    category: 'Text',
    editor: 'dash:RichTextEditor',
    icon: 'B',
    defaults: { nodeKind: 'sh:Literal', datatype: 'rdf:HTML' },
  },
  {
    id: 'URIEditor',
    name: 'URI',
    desc: 'IRI / link input',
    category: 'References',
    editor: 'dash:URIEditor',
    icon: '↗',
    defaults: { nodeKind: 'sh:IRI' },
  },
  {
    id: 'AutoCompleteEditor',
    name: 'Auto-complete',
    desc: 'Instances lookup by label',
    category: 'References',
    editor: 'dash:AutoCompleteEditor',
    icon: '⌕',
    defaults: { nodeKind: 'sh:IRI', class: 'foaf:Agent' },
  },
  {
    id: 'InstancesSelectEditor',
    name: 'Instances select',
    desc: 'Drop-down of instances',
    category: 'References',
    editor: 'dash:InstancesSelectEditor',
    icon: '▼',
    defaults: { nodeKind: 'sh:IRI' },
  },
  {
    id: 'DetailsEditor',
    name: 'Details (nested)',
    desc: 'Embedded sub-form',
    category: 'References',
    editor: 'dash:DetailsEditor',
    icon: '▢',
    defaults: { nodeKind: 'sh:BlankNodeOrIRI' },
  },
  {
    id: 'EnumSelectEditor',
    name: 'Enumeration',
    desc: 'Choice from fixed list',
    category: 'Choice',
    editor: 'dash:EnumSelectEditor',
    icon: '◉',
    defaults: { nodeKind: 'sh:Literal', datatype: 'xsd:string', inValues: [lit('Option A'), lit('Option B')] },
  },
  {
    id: 'BooleanSelectEditor',
    name: 'Boolean',
    desc: 'true / false select',
    category: 'Choice',
    editor: 'dash:BooleanSelectEditor',
    icon: '☑',
    defaults: { nodeKind: 'sh:Literal', datatype: 'xsd:boolean' },
  },
  {
    id: 'DatePickerEditor',
    name: 'Date picker',
    desc: 'Calendar selector',
    category: 'Date & number',
    editor: 'dash:DatePickerEditor',
    icon: '◫',
    defaults: { nodeKind: 'sh:Literal', datatype: 'xsd:date' },
  },
  {
    id: 'DateTimePickerEditor',
    name: 'Date & time',
    desc: 'Date with time',
    category: 'Date & number',
    editor: 'dash:DateTimePickerEditor',
    icon: '⏱',
    defaults: { nodeKind: 'sh:Literal', datatype: 'xsd:dateTime' },
  },
  {
    id: 'NumberFieldEditor',
    name: 'Number',
    desc: 'Numeric field',
    category: 'Date & number',
    editor: 'dash:NumberFieldEditor',
    icon: '№',
    defaults: { nodeKind: 'sh:Literal', datatype: 'xsd:integer' },
  },
];

export const WIDGET_BY_ID: Record<string, Widget> = Object.fromEntries(
  WIDGETS.map((w) => [w.id, w]),
);

// IDs are client-side only and never persisted, so the ~2B collision space of
// 6 base-36 chars is safe in practice.
export function newId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}
