export type NodeKind =
  | 'sh:Literal'
  | 'sh:IRI'
  | 'sh:BlankNode'
  | 'sh:BlankNodeOrIRI'
  | 'sh:BlankNodeOrLiteral'
  | 'sh:IRIOrLiteral';

export interface WidgetDefaults {
  nodeKind?: NodeKind;
  datatype?: string;
  class?: string;
  inValues?: string[];
}

export interface Widget {
  id: string;
  name: string;
  desc: string;
  category: string;
  editor: string;
  icon: string;
  defaults: WidgetDefaults;
}

export interface Field {
  id: string;
  widgetId: string;
  name: string;
  description: string;
  path: string;
  order: number;
  nodeKind: NodeKind | null;
  datatype: string | null;
  class: string | null;
  node: string | null;
  minCount: number | null;
  maxCount: number | null;
  minLength: number | null;
  maxLength: number | null;
  pattern: string;
  defaultValue: string;
  inValues: string[] | null;
}

export interface Group {
  id: string;
  label: string;
  order: number;
  fields: Field[];
}

export interface Prefix {
  prefix: string;
  uri: string;
}

export interface NestedShape {
  id: string;
  iri: string;
  targetClass: string;
  fields: Field[];
}

export interface Schema {
  schemaName: string;
  schemaDescription: string;
  shapeIri: string;
  targetClass: string;
  prefixes: Prefix[];
  groups: Group[];
  nestedShapes: NestedShape[];
}

export type SelectedKind = 'schema' | 'field' | 'group' | 'nested-shape' | 'nested-field';

export type Mutator = (draft: Schema) => void;
