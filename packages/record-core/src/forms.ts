// One form from several peer NodeShapes. An FDP serves the shapes of a
// resource type as a graph of peers (e.g. ResourceShape for dcat:Resource and
// DatasetShape for dcat:Dataset, GET /dataset/spec), while the Schema model
// treats the first shape as the form and the rest as nested shapes.
import { expandTerm, fieldKey } from './record';
import type { Field, Group, NestedShape, Schema } from './types';

/**
 * A Schema whose form holds the fields of every shape that targets one of
 * `targetClasses` (full IRIs). Shapes are merged in the order of
 * `targetClasses`, groups with the same IRI or label are combined, and a path
 * that appears in several shapes is kept once (first occurrence). Other
 * shapes stay nested, so `sh:node` references (e.g. to an Agent shape) keep
 * working. The primary shape becomes the first matching one.
 */
export function formSchema(schema: Schema, targetClasses: string[]): Schema {
  const rank = (cls: string): number => {
    const iri = expandTerm(cls, schema.prefixes);
    return iri === null ? -1 : targetClasses.indexOf(iri);
  };
  const peers: { iri: string; targetClass: string; groups: Group[]; nested?: NestedShape }[] = [
    { iri: schema.shapeIri, targetClass: schema.targetClass, groups: schema.groups },
    ...schema.nestedShapes.map((ns) => ({
      iri: ns.iri,
      targetClass: ns.targetClass,
      groups: ns.fields.length ? [{ id: `g_${ns.id}`, label: '', order: 0, fields: ns.fields }] : [],
      nested: ns,
    })),
  ];
  const matching = peers
    .map((p, i) => ({ ...p, rank: rank(p.targetClass), i }))
    .filter((p) => p.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  if (!matching.length) return schema;

  const groups: Group[] = [];
  const seen = new Set<string>();
  for (const shape of matching) {
    for (const g of [...shape.groups].sort((a, b) => a.order - b.order)) {
      // A peer's unnamed field list joins the first group (or a "General" one).
      const target =
        groups.find((x) => (g.iri && x.iri === g.iri) || (g.label && x.label === g.label)) ??
        (!g.label && !g.iri && groups.length ? groups[0] : undefined);
      const fields: Field[] = [...g.fields]
        .sort((a, b) => a.order - b.order)
        .filter((f) => !seen.has(fieldKey(f)) && !!seen.add(fieldKey(f)));
      if (target) target.fields.push(...fields);
      else groups.push({ ...g, label: g.label || 'General', fields });
    }
  }
  groups.forEach((g, gi) => {
    g.order = gi;
    g.fields = g.fields.map((f, fi) => ({ ...f, order: fi }));
  });

  const primary = matching[0];
  const merged = new Set(matching.map((m) => m.iri));
  return {
    ...schema,
    shapeIri: primary.iri,
    targetClass: primary.targetClass,
    groups: groups.filter((g) => g.fields.length),
    nestedShapes: schema.nestedShapes.filter((ns) => !merged.has(ns.iri)),
  };
}
