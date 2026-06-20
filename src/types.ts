export type NodeKind =
  | 'sh:Literal'
  | 'sh:IRI'
  | 'sh:BlankNode'
  | 'sh:BlankNodeOrIRI'
  | 'sh:BlankNodeOrLiteral'
  | 'sh:IRIOrLiteral';

// A single member of an sh:in enumeration. Kept as a tagged value so IRIs
// (controlled-vocabulary terms) round-trip as IRIs, not string literals.
export interface InValue {
  value: string;            // literal text, or the CURIE / <iri> for IRIs
  kind: 'literal' | 'iri';
}

export interface WidgetDefaults {
  nodeKind?: NodeKind;
  datatype?: string;
  class?: string;
  inValues?: InValue[];
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
  class: string | null;  // sh:class — constrains the IRI to instances of this RDF class
  node: string | null;   // sh:node — references another NodeShape for nested validation
  minCount: number | null;
  maxCount: number | null;
  minLength: number | null;
  maxLength: number | null;
  // Value-range bounds (sh:minInclusive / maxInclusive / minExclusive /
  // maxExclusive). Stored as raw lexical text ('' = unset) so they cover both
  // numbers ("1900") and dates ("2020-01-01"). Optional — only set on
  // numeric/date fields.
  minInclusive?: string;
  maxInclusive?: string;
  minExclusive?: string;
  maxExclusive?: string;
  pattern: string;
  defaultValue: string;
  inValues: InValue[] | null;
  // Custom validation feedback (sh:message) and its level (sh:severity —
  // sh:Violation default, sh:Warning, sh:Info). Both optional.
  message?: string;
  severity?: string;
  // Stable blank-node label, set only when this property carries SHACL the
  // visual editor doesn't model (e.g. sh:or, sh:message). Those triples live in
  // Schema.residual keyed by this label; the generator emits the property as a
  // labeled node so they re-link losslessly. Unset → emitted inline as `[ … ]`.
  bnode?: string;
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
  // SHACL/RDF the editor doesn't model, preserved verbatim as N-Triples and
  // re-emitted in a commented tail so open → edit → save is lossless.
  residual?: string;
}

export type SelectedKind = 'schema' | 'field' | 'group' | 'nested-shape' | 'nested-field';

export type Mutator = (draft: Schema) => void;
