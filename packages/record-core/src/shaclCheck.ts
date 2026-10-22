// Full SHACL (Core) validation of a record with shacl-engine, against the whole
// schema graph — including the "Preserved" constructs Contour doesn't model
// (qualified shapes, sh:xone / sh:not, sh:languageIn, complex paths, …).
// Results are mapped back to form locations so the UI can point at the field.
import N3 from 'n3';
import { Validator } from 'shacl-engine';
import type { Quad } from './rdf';
import { parseRdf } from './rdf';
import { serializeSchema } from './shacl';
import { expandTerm, fieldKey, localName, recordToQuads, type NodeLocations, type RecordIssueSeverity, type RecordNode } from './record';
import type { Schema } from './types';

const SH = 'http://www.w3.org/ns/shacl#';
const RDFS_SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';

export interface ShaclFinding {
  /** Form location (`key` or `parent/index/key`), or null when it can't be placed. */
  loc: string | null;
  fieldName: string;
  severity: RecordIssueSeverity;
  /** Constraint component local name without the suffix, e.g. `MinCount`. */
  component: string;
  /** The field's sh:message, when it declares one. */
  message: string;
  /** The engine's own (English) message — a fallback for unplaced findings. */
  engineMessage: string;
  value: string | null;
  focus: string;
}

export interface ShaclCheckResult {
  conforms: boolean;
  findings: ShaclFinding[];
}

// The engine's Result objects (not exported with types by the package).
interface EngineTerm { termType: string; value: string; id?: string }
interface EngineStep { start: 'subject' | 'object'; predicates: EngineTerm[]; quantifier: string }
interface EngineResult {
  focusNode: { term: EngineTerm };
  path: EngineStep[] | null;
  severity: EngineTerm;
  constraintComponent: EngineTerm;
  message: EngineTerm[];
  value?: { term?: EngineTerm };
  results: EngineResult[];
}

const factory = { ...N3.DataFactory, dataset: (quads?: Quad[]) => new N3.Store(quads) };

function termId(t: EngineTerm): string {
  return t.termType === 'BlankNode' ? `_:${t.value}` : t.value;
}

/**
 * Validate a record. `extra` adds context the record itself doesn't carry —
 * the rdf:type of linked resources and rdfs:subClassOf links — so sh:class
 * constraints on references can be checked.
 */
export async function checkRecordShacl(
  schema: Schema,
  subjectIri: string,
  values: RecordNode,
  extra: Quad[] = [],
): Promise<ShaclCheckResult> {
  const shapes = parseRdf(serializeSchema(schema, 'turtle'), 'turtle');
  if (shapes.error) throw new Error(shapes.error);
  const nodes: NodeLocations = new Map();
  const data = [...recordToQuads(schema, subjectIri, values, nodes), ...extra];

  // shacl-engine resolves rdfs:subClassOf from the shapes graph (the spec reads
  // the data graph): give it the subclass links in both.
  const subclassLinks = extra.filter((q) => q.predicate.value === RDFS_SUBCLASS);
  const validator = new Validator(new N3.Store([...shapes.quads, ...subclassLinks]), { factory, details: true });
  const report = await validator.validate({ dataset: new N3.Store(data) });

  const locate = (r: EngineResult): Pick<ShaclFinding, 'loc' | 'fieldName' | 'message'> => {
    const node = nodes.get(termId(r.focusNode.term)) ?? nodes.get(r.focusNode.term.id ?? '');
    const step = r.path && r.path.length === 1 && r.path[0].predicates.length === 1 ? r.path[0] : null;
    if (!step) return { loc: node && node.loc ? node.loc : null, fieldName: '', message: '' };
    const pred = step.predicates[0].value;
    const inverse = step.start === 'object';
    const f = node?.fields.find((ff) => expandTerm(ff.path, schema.prefixes) === pred && !!ff.inversePath === inverse);
    if (!node || !f) return { loc: null, fieldName: localName(pred), message: '' };
    return {
      loc: node.loc ? `${node.loc}/${fieldKey(f)}` : fieldKey(f),
      fieldName: f.name || localName(pred),
      message: f.message || '',
    };
  };

  const findings: ShaclFinding[] = [];
  const visit = (r: EngineResult) => {
    const component = localName(r.constraintComponent.value).replace(/ConstraintComponent$/, '');
    // A failing sh:node is explained by its nested results: report those.
    if (component === 'Node' && r.results?.length) { r.results.forEach(visit); return; }
    const sev = localName(r.severity.value);
    findings.push({
      ...locate(r),
      severity: sev === 'Warning' ? 'warning' : sev === 'Info' ? 'info' : 'error',
      component,
      engineMessage: r.message?.[0]?.value || '',
      // The engine reports the focus node itself as "value" for node-level checks.
      value: r.value?.term && !(r.value.term.termType === r.focusNode.term.termType && r.value.term.value === r.focusNode.term.value)
        ? r.value.term.value : null,
      focus: r.focusNode.term.value,
    });
  };
  for (const r of report.results as unknown as EngineResult[]) {
    if (r.severity.value.startsWith(SH)) visit(r);
  }
  // A nested node can be reached twice — via the parent's sh:node and via its
  // own shape's sh:targetClass — yielding identical findings.
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    const k = [f.loc, f.component, f.focus, f.value, f.severity, f.message].join('\u0001');
    return !seen.has(k) && !!seen.add(k);
  });
  return { conforms: report.conforms, findings: unique };
}
