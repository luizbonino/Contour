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

// A language-tagged string (rdf:langString). `lang` is a BCP-47 tag (e.g. 'en',
// 'pt-BR'); '' is never stored here — untagged primary values use the field's
// plain value + its *Lang property.
export interface LangValue {
  value: string;
  lang: string;
}

// One branch of an sh:or value-type alternative. Each is a type-only shape
// ([ sh:datatype … ] / [ sh:nodeKind … ] / [ sh:class … ]). Anything richer
// stays in the residual graph rather than being modeled here.
export interface OrType {
  nodeKind?: string;
  datatype?: string;
  class?: string;
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
  // Optional language tags for the primary name/description (sh:name/sh:description
  // as rdf:langString), plus any additional translations. Empty/unset → untagged.
  nameLang?: string;
  descriptionLang?: string;
  nameI18n?: LangValue[];
  descriptionI18n?: LangValue[];
  path: string;
  order: number;
  nodeKind: NodeKind | null;
  datatype: string | null;
  class: string | null;  // sh:class — constrains the IRI to instances of this RDF class
  node: string | null;   // sh:node — references another NodeShape for nested validation
  inversePath?: boolean; // sh:path is an inverse path: [ sh:inversePath <path> ]
  // Alternative value types (sh:or of type-only shapes), e.g. "literal or IRI".
  orTypes?: OrType[];
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
