// English message catalog (default / fallback locale).
// Keys are resolved with dotted paths by useI18n. {placeholders} are interpolated.
// Plural entries are { one, other } objects resolved via the `plural()` helper.

const en = {
  common: {
    new: 'New',
    open: 'Open…',
    save: 'Save',
    saved: 'Saved!',
    error: 'Error',
    saveAs: 'Save As…',
    copy: 'Copy',
    copyShacl: 'Copy SHACL',
  },
  header: {
    newTitle: 'Start a new schema',
    newConfirm: 'Discard the current schema and start a new one?',
    openTitle: 'Open a SHACL Turtle file',
    saveTitle: 'Save to current file (Ctrl+S)',
    saveAsTitle: 'Save as a new file',
    language: 'Language',
  },
  page: {
    edit: 'Edit {name}',
    newSchema: 'New metadata schema',
  },
  tabs: {
    definition: 'SHACL Code',
    visualEditor: 'Visual Editor',
    formPreview: 'Form Preview',
  },
  visual: {
    calloutHtml:
      '<strong>Visual Editor</strong> — drag DASH form widgets from the left ' +
      'palette onto the canvas. Each widget becomes a SHACL ' +
      '<code>sh:property</code>. Switch to the <strong>SHACL Code</strong> tab ' +
      'to view or edit the generated Turtle, or <strong>Form Preview</strong> ' +
      'to see the rendered form.',
  },
  preview: {
    generatedShacl: 'Generated SHACL (Turtle)',
    formPreview: 'Form preview',
    tabShacl: 'SHACL',
    tabForm: 'Form',
    copyTurtle: 'Copy Turtle',
  },
  actions: {
    in: 'in',
  },
  definition: {
    name: 'Name',
    description: 'Description',
    formDefinition: 'Form Definition (SHACL · Turtle)',
    loadedFromFile: 'Loaded from file',
    discardLoaded: 'Discard loaded file',
    discardLoadedTitle: 'Discard loaded file and show generated SHACL',
    openInVisualEditor: 'Open in Visual Editor',
    importError: 'Could not import into Visual Editor — {error}',
    syncHint:
      'Edit the Turtle directly — changes are parsed and synced back to the Visual Editor automatically.',
  },
  formPreviewTab: {
    rendered: 'Rendered form preview',
    target: 'target',
  },
  canvas: {
    formCanvas: 'Form canvas',
    in: 'in',
    addGroup: 'Add group',
    addAnotherGroup: 'Add another group',
    addNestedShape: 'Add nested shape',
    schemaSettings: 'Schema settings',
    untitledSchema: 'Untitled schema',
    dropWidgetHere: 'Drop a widget here',
    emptyTitle: 'Drop widgets here to design your form',
    emptySub: 'Drag any widget from the left panel onto this canvas.',
    nestedShapes: 'Nested shapes',
    deleteGroupTitle: 'Delete group',
    deleteNestedShapeTitle: 'Delete nested shape',
  },
  fieldCard: {
    duplicate: 'Duplicate',
    delete: 'Delete',
    required: 'Required',
    multi: 'multi',
    unnamed: '(unnamed)',
  },
  inspector: {
    title: 'Inspector',
    backToSchema: 'Back to schema',
    subtitle: {
      field: 'Property settings',
      group: 'Group settings',
      nestedShape: 'Nested shape settings',
      nestedField: 'Nested field settings',
      schema: 'Schema settings',
    },
    section: {
      basic: 'Basic',
      constraints: 'Constraints',
      defaultsOrder: 'Defaults & order',
      identity: 'Identity',
      shapeDefinition: 'Shape definition',
      vocabularies: 'Vocabularies',
      properties: 'Properties',
    },
    label: {
      name: 'Label (sh:name)',
      path: 'Property path (sh:path)',
      minCount: 'Min count',
      maxCount: 'Max count',
      nodeKind: 'Node kind',
      datatype: 'Datatype',
      class: 'Class (sh:class)',
      nestedShape: 'Nested shape (sh:node)',
      minLength: 'Min length',
      maxLength: 'Max length',
      pattern: 'Pattern (regex)',
      defaultValue: 'Default value',
      order: 'Order (sh:order)',
      group: 'Group',
      nestedShapeRef: 'Nested shape',
      shapeIri: 'Shape IRI',
      targetClass: 'Target class (sh:targetClass)',
      fields: 'Fields',
      groupLabel: 'Label',
      groupOrder: 'Order',
      schemaName: 'Schema name',
      description: 'Description',
    },
    placeholder: {
      descriptionHelp: 'Help text shown to the user',
    },
    hint: {
      nestedShape: "sh:NodeShape that defines the nested object's fields.",
      moveFieldGroup: 'Move the field by dragging it into another group.',
      moveFieldNested: 'Move the field by dragging it within the shape.',
      shapeIriRename: 'Renaming updates all sh:node references automatically.',
      addFieldsDrag: 'Add fields by dragging widgets from the palette onto this shape.',
    },
    none: '— none —',
    headingNestedShape: 'Nested shape',
    headingGroup: 'Group',
    headingSchema: 'Schema settings',
    deleteNestedShape: 'Delete nested shape',
    deleteGroup: 'Delete group',
  },
  palette: {
    title: 'Widgets',
    subtitle: 'Drag to canvas · DASH',
    search: 'Search widgets…',
  },
  prefixes: {
    label: 'Prefixes',
    remove: 'Remove',
  },
  inValues: {
    label: 'Allowed values (sh:in)',
    placeholder: 'Add value + Enter',
    hint: 'Press Enter to add. Stored as sh:in ( "a" "b" "c" ).',
  },
  formPreview: {
    empty: 'Add fields to see a live preview of the rendered form.',
    add: '+ Add',
    removeValue: 'Remove this value',
    nestedSubform: '{iri} sub-form',
    nestedSubformGeneric: 'Nested sub-form',
  },
  fieldInput: {
    select: '— select —',
    search: 'Start typing to search…',
  },
  count: {
    properties: { one: '{n} property', other: '{n} properties' },
    groups: { one: '{n} group', other: '{n} groups' },
    nestedShapes: { one: '{n} nested shape', other: '{n} nested shapes' },
    fields: { one: '{n} field', other: '{n} fields' },
  },
  // Widget catalogue display strings (ids are stable; only display localizes).
  widget: {
    TextFieldEditor: { name: 'Text field', desc: 'Single-line text' },
    TextAreaEditor: { name: 'Text area', desc: 'Multi-line text' },
    RichTextEditor: { name: 'Rich text', desc: 'Formatted text with language tag' },
    URIEditor: { name: 'URI', desc: 'IRI / link input' },
    AutoCompleteEditor: { name: 'Auto-complete', desc: 'Instances lookup by label' },
    InstancesSelectEditor: { name: 'Instances select', desc: 'Drop-down of instances' },
    DetailsEditor: { name: 'Details (nested)', desc: 'Embedded sub-form' },
    EnumSelectEditor: { name: 'Enumeration', desc: 'Choice from fixed list' },
    BooleanSelectEditor: { name: 'Boolean', desc: 'true / false select' },
    DatePickerEditor: { name: 'Date picker', desc: 'Calendar selector' },
    DateTimePickerEditor: { name: 'Date & time', desc: 'Date with time' },
    NumberFieldEditor: { name: 'Number', desc: 'Numeric field' },
  },
  category: {
    Text: 'Text',
    References: 'References',
    Choice: 'Choice',
    'Date & number': 'Date & number',
  },
};

export default en;
