// SHACL Turtle generator + simple syntax highlighter
import { WIDGET_BY_ID, newId } from './data';
import type { Field, Group, NestedShape, NodeKind, Prefix, Schema } from './types';

const EDITOR_TO_WIDGET: Record<string, (typeof WIDGET_BY_ID)[string]> = {};
for (const w of Object.values(WIDGET_BY_ID)) {
  if (w.editor) EDITOR_TO_WIDGET[w.editor] = w;
}

// ── Parser helpers ────────────────────────────────────────────────────────────

function unescapeString(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

/** Find the matching ']' for the '[' at `start`, skipping strings and nested brackets. */
function findMatchingBracket(text: string, start: number): number {
  let inStr = false, esc = false, depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Return the index of the first top-level '.' (not inside strings or brackets) from `from`. */
function findTopLevelDot(text: string, from: number): number {
  let inStr = false, esc = false, depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === '.' && depth === 0) {
      const next = text[i + 1];
      if (!next || /\s/.test(next)) return i;
    }
  }
  return -1;
}

function lineAt(text: string, pos: number): number {
  return text.slice(0, pos).split('\n').length;
}

// Canonical alias for each namespace URI the parser relies on internally.
const PARSER_CANONICAL: Record<string, string> = {
  'http://www.w3.org/ns/shacl#':                 'sh',
  'http://datashapes.org/dash#':                  'dash',
  'http://www.w3.org/2000/01/rdf-schema#':        'rdfs',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#':  'rdf',
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite user-declared prefix aliases to the canonical ones the parser uses
 * internally (sh:, dash:, rdfs:, rdf:). Only touches aliases that differ from
 * the canonical. Replacement is token-level so it never fires inside <...> IRIs
 * or "..." string literals.
 */
function normalizeAliases(text: string, prefixes: Prefix[]): string {
  let result = text;
  for (const { prefix, uri } of prefixes) {
    const canonical = PARSER_CANONICAL[uri];
    if (!canonical || canonical === prefix) continue;
    const re = new RegExp(`(^|[\\s;,([])${escapeRe(prefix)}:`, 'gm');
    result = result.replace(re, `$1${canonical}:`);
  }
  return result;
}

/**
 * Replace Turtle line comments with equal-length spaces while preserving character
 * positions for line-number reporting. Skips '#' that appear inside <...> IRIs or
 * "..." string literals so fragment identifiers (e.g. shacl#, XMLSchema#) survive.
 */
function stripComments(turtle: string): string {
  let out = '';
  let inStr = false, esc = false, inUri = false;
  for (let i = 0; i < turtle.length; i++) {
    const c = turtle[i];
    if (esc)                         { esc = false; out += c; continue; }
    if (c === '\\' && inStr)         { esc = true;  out += c; continue; }
    if (c === '"' && !inUri)         { inStr = !inStr; out += c; continue; }
    if (c === '<' && !inStr)         { inUri = true;  out += c; continue; }
    if (c === '>' && inUri)          { inUri = false; out += c; continue; }
    if (c === '#' && !inStr && !inUri) {
      while (i < turtle.length && turtle[i] !== '\n') { out += ' '; i++; }
      if (i < turtle.length) { out += '\n'; }
      continue;
    }
    out += c;
  }
  return out;
}

function parsePropertyBlock(block: string): Field | null {
  const getString = (pred: string): string | null => {
    const m = block.match(new RegExp(String.raw`${pred}\s+"((?:[^"\\]|\\.)*)"`));
    return m ? unescapeString(m[1]) : null;
  };
  const getIri = (pred: string): string | null => {
    const fullM = block.match(new RegExp(String.raw`${pred}\s+<([^>]*)>`));
    if (fullM) return `<${fullM[1]}>`;
    const m = block.match(new RegExp(String.raw`${pred}\s+([^\s;.\]]+)`));
    return m ? m[1] : null;
  };
  const getNum = (pred: string): number | null => {
    const m = block.match(new RegExp(String.raw`${pred}\s+(\d+)`));
    return m ? parseInt(m[1], 10) : null;
  };

  const path = getIri('sh:path');
  if (!path) return null;

  const editorVal = getIri('dash:editor');
  const widget = (editorVal && EDITOR_TO_WIDGET[editorVal]) || WIDGET_BY_ID['TextFieldEditor'];
  if (!widget) return null;

  let inValues: string[] | null = null;
  const inMatch = block.match(/sh:in\s*\(([\s\S]*?)\)/);
  if (inMatch) {
    const vals: string[] = [];
    const valRe = /"((?:[^"\\]|\\.)*)"/g;
    let vm: RegExpExecArray | null;
    while ((vm = valRe.exec(inMatch[1])) !== null) vals.push(unescapeString(vm[1]));
    if (vals.length) inValues = vals;
  }

  return {
    id: newId('f'),
    widgetId: widget.id,
    name: getString('sh:name') ?? '',
    description: getString('sh:description') ?? '',
    path,
    order: getNum('sh:order') ?? 0,
    nodeKind: getIri('sh:nodeKind') as NodeKind | null,
    datatype: getIri('sh:datatype'),
    class: getIri('sh:class'),
    node: getIri('sh:node'),
    minCount: getNum('sh:minCount'),
    maxCount: getNum('sh:maxCount'),
    minLength: getNum('sh:minLength'),
    maxLength: getNum('sh:maxLength'),
    pattern: getString('sh:pattern') ?? '',
    defaultValue: getString('sh:defaultValue') ?? '',
    inValues,
  };
}

// ── Public parse result type ──────────────────────────────────────────────────

export interface ShaclParseResult {
  schema: Schema | null;
  error: string | null;
  errorLine: number | null;
}

export function parseShacl(turtle: string): ShaclParseResult {
  const ok = (schema: Schema): ShaclParseResult => ({ schema, error: null, errorLine: null });
  const fail = (error: string, pos?: number): ShaclParseResult => ({
    schema: null,
    error,
    errorLine: pos !== undefined ? lineAt(turtle, pos) : null,
  });

  try {
    const text = stripComments(turtle);

    // ── @prefix ───────────────────────────────────────────────────────────────
    const prefixes: Prefix[] = [];
    const prefixRe = /@prefix\s+([\w-]*):\s*<([^>]*)>\s*\./g;
    let m: RegExpExecArray | null;
    while ((m = prefixRe.exec(text)) !== null) {
      prefixes.push({ prefix: m[1], uri: m[2] });
    }

    // Normalize user-chosen aliases (e.g. "shacl:", "dashacl:") to the canonical
    // forms the parser uses internally ("sh:", "dash:", etc.).
    const normalized = normalizeAliases(text, prefixes);

    // ── PropertyGroups ────────────────────────────────────────────────────────
    const groupEntries: Array<{ iri: string; group: Group }> = [];
    const pgRe = /([\w:-]+)\s+a\s+sh:PropertyGroup/g;
    while ((m = pgRe.exec(normalized)) !== null) {
      const iri = m[1];
      const dotIdx = findTopLevelDot(normalized, m.index);
      const block = dotIdx >= 0 ? normalized.slice(m.index, dotIdx + 1) : normalized.slice(m.index);
      const labelM = block.match(/rdfs:label\s+"((?:[^"\\]|\\.)*)"/);
      const orderM = block.match(/sh:order\s+(\d+)/);
      groupEntries.push({
        iri,
        group: {
          id: newId('g'),
          label: labelM
            ? unescapeString(labelM[1])
            : iri.replace(/^[\w-]*:/, '').replace(/Group$/, ''),
          order: orderM ? parseInt(orderM[1], 10) : groupEntries.length,
          fields: [],
        },
      });
    }
    const groups = groupEntries.map((e) => e.group);
    const groupByIri: Record<string, Group> = {};
    groupEntries.forEach(({ iri, group }) => { groupByIri[iri] = group; });

    // ── Collect all NodeShape blocks (bounded to their statement) ─────────────
    const nsRe = /([\w:-]+|<[^>]+>)\s+a\s+sh:NodeShape/g;
    const nsBlocks: Array<{ iri: string; body: string; pos: number }> = [];
    while ((m = nsRe.exec(normalized)) !== null) {
      const pos = m.index;
      const dotIdx = findTopLevelDot(normalized, pos);
      const end = dotIdx >= 0 ? dotIdx + 1 : normalized.length;
      nsBlocks.push({ iri: m[1], body: normalized.slice(pos, end), pos });
    }
    if (nsBlocks.length === 0) return fail('No sh:NodeShape declaration found in the file');

    // ── Main NodeShape (first) ────────────────────────────────────────────────
    const { iri: shapeIri, body: shapeBody, pos: nsPos } = nsBlocks[0];

    const metaEnd = shapeBody.indexOf('sh:property');
    const metaPart = metaEnd >= 0 ? shapeBody.slice(0, metaEnd) : shapeBody;
    const nameLabelM = metaPart.match(/rdfs:label\s+"((?:[^"\\]|\\.)*)"/);
    const schemaName = nameLabelM ? unescapeString(nameLabelM[1]) : '';
    const targetClassM = metaPart.match(/sh:targetClass\s+([^\s;.\[\]]+)/);
    const targetClass = targetClassM ? targetClassM[1] : '';

    // ── Main shape: sh:property [...] blocks ──────────────────────────────────
    // Handles both repeated-predicate style (sh:property [...] ; sh:property [...])
    // and comma-separated style (sh:property [...], [...], [...]).
    const fieldEntries: Array<{ field: Field; groupIri: string | null }> = [];
    let propSearchFrom = 0;
    while (true) {
      const propIdx = shapeBody.indexOf('sh:property', propSearchFrom);
      if (propIdx < 0) break;
      let pos = propIdx + 'sh:property'.length;
      while (true) {
        while (pos < shapeBody.length && /[\s,]/.test(shapeBody[pos])) pos++;
        if (pos >= shapeBody.length || shapeBody[pos] !== '[') break;
        const bStart = pos;
        const bEnd = findMatchingBracket(shapeBody, bStart);
        if (bEnd < 0) return fail('Unclosed "[" in sh:property block', nsPos + bStart);
        const blockContent = shapeBody.slice(bStart + 1, bEnd);
        const field = parsePropertyBlock(blockContent);
        if (!field) return fail('sh:property block is missing sh:path', nsPos + bStart);
        const groupM = blockContent.match(/sh:group\s+([\w:-]+)/);
        fieldEntries.push({ field, groupIri: groupM ? groupM[1] : null });
        pos = bEnd + 1;
      }
      propSearchFrom = pos;
    }

    // ── Assign fields to groups ───────────────────────────────────────────────
    let fallbackGroup: Group | null = null;
    fieldEntries.forEach(({ field, groupIri }) => {
      let targetGroup = groupIri ? groupByIri[groupIri] : undefined;
      if (!targetGroup) {
        if (!fallbackGroup) {
          fallbackGroup = { id: newId('g'), label: 'General', order: groups.length, fields: [] };
          groups.push(fallbackGroup);
        }
        targetGroup = fallbackGroup;
      }
      targetGroup.fields.push(field);
    });

    // ── Nested NodeShapes (all after the first) ───────────────────────────────
    const nestedShapes: NestedShape[] = [];
    for (let ni = 1; ni < nsBlocks.length; ni++) {
      const { iri, body } = nsBlocks[ni];
      const tcM = body.match(/sh:targetClass\s+([^\s;.\[\]]+)/);
      const nestedFields: Field[] = [];
      let nFrom = 0;
      while (true) {
        const propIdx = body.indexOf('sh:property', nFrom);
        if (propIdx < 0) break;
        let pos = propIdx + 'sh:property'.length;
        while (true) {
          while (pos < body.length && /[\s,]/.test(body[pos])) pos++;
          if (pos >= body.length || body[pos] !== '[') break;
          const bStart = pos;
          const bEnd = findMatchingBracket(body, bStart);
          if (bEnd < 0) break;
          const field = parsePropertyBlock(body.slice(bStart + 1, bEnd));
          if (field) nestedFields.push(field);
          pos = bEnd + 1;
        }
        nFrom = pos;
      }
      nestedShapes.push({ id: newId('ns'), iri, targetClass: tcM ? tcM[1] : '', fields: nestedFields });
    }

    return ok({ schemaName, schemaDescription: '', shapeIri, targetClass, prefixes, groups, nestedShapes });
  } catch (err) {
    return {
      schema: null,
      error: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
      errorLine: null,
    };
  }
}

function compactNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function quoteString(s: string): string {
  return `"${String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')}"`;
}

function fieldToProps(field: Field): string[] {
  const w = WIDGET_BY_ID[field.widgetId];
  const lines: string[] = [];
  lines.push(`sh:path ${field.path || ':unknownPath'}`);
  if (field.name) lines.push(`sh:name ${quoteString(field.name)}`);
  if (field.description) lines.push(`sh:description ${quoteString(field.description)}`);
  if (field.nodeKind) lines.push(`sh:nodeKind ${field.nodeKind}`);
  if (field.datatype) lines.push(`sh:datatype ${field.datatype}`);
  if (field.class) lines.push(`sh:class ${field.class}`);
  if (field.node) lines.push(`sh:node ${field.node}`);
  const mn = compactNumeric(field.minCount);
  if (mn !== null) lines.push(`sh:minCount ${mn}`);
  const mx = compactNumeric(field.maxCount);
  if (mx !== null) lines.push(`sh:maxCount ${mx}`);
  const mnl = compactNumeric(field.minLength);
  if (mnl !== null) lines.push(`sh:minLength ${mnl}`);
  const mxl = compactNumeric(field.maxLength);
  if (mxl !== null) lines.push(`sh:maxLength ${mxl}`);
  if (field.pattern) lines.push(`sh:pattern ${quoteString(field.pattern)}`);
  if (field.defaultValue) lines.push(`sh:defaultValue ${quoteString(field.defaultValue)}`);
  if (Array.isArray(field.inValues) && field.inValues.length > 0) {
    const items = field.inValues.map((v) => quoteString(v)).join(' ');
    lines.push(`sh:in ( ${items} )`);
  }
  if (typeof field.order === 'number') lines.push(`sh:order ${field.order}`);
  if (w && w.editor) lines.push(`dash:editor ${w.editor}`);
  return lines;
}

export function generateShacl(schema: Schema): string {
  const out: string[] = [];

  for (const p of schema.prefixes || []) {
    out.push(`@prefix ${p.prefix}: <${p.uri}> .`);
  }
  out.push('');

  const groups = (schema.groups || []).slice().sort((a, b) => a.order - b.order);
  for (const g of groups) {
    const gIri = `:${(g.label || 'group').replace(/\s+/g, '')}Group`;
    out.push(`${gIri}`);
    out.push(`  a sh:PropertyGroup ;`);
    out.push(`  rdfs:label ${quoteString(g.label || 'Group')} ;`);
    out.push(`  sh:order ${g.order} .`);
    out.push('');
  }

  out.push(`${schema.shapeIri || ':Shape'}`);
  out.push(`  a sh:NodeShape ;`);
  if (schema.schemaName) {
    out.push(`  rdfs:label ${quoteString(schema.schemaName)} ;`);
  }
  if (schema.targetClass) {
    out.push(`  sh:targetClass ${schema.targetClass} ;`);
  }

  const allFields: Array<{ field: Field; group: (typeof groups)[number] }> = [];
  groups.forEach((g) => {
    (g.fields || []).forEach((f) => allFields.push({ field: f, group: g }));
  });

  if (allFields.length === 0) {
    out[out.length - 1] = out[out.length - 1].replace(/;$/, '.');
  } else {
    allFields.forEach(({ field, group }, idx) => {
      const isLast = idx === allFields.length - 1;
      const lines = fieldToProps(field);
      if (group) {
        const gIri = `:${(group.label || 'group').replace(/\s+/g, '')}Group`;
        lines.push(`sh:group ${gIri}`);
      }
      out.push(`  sh:property [`);
      lines.forEach((l, i) => {
        const terminator = i === lines.length - 1 ? '' : ' ;';
        out.push(`    ${l}${terminator}`);
      });
      out.push(`  ]${isLast ? ' .' : ' ;'}`);
    });
  }

  for (const ns of schema.nestedShapes || []) {
    out.push('');
    out.push(`${ns.iri}`);
    out.push(`  a sh:NodeShape ;`);
    if (ns.targetClass) out.push(`  sh:targetClass ${ns.targetClass} ;`);
    const nsFields = (ns.fields || []).slice().sort((a, b) => a.order - b.order);
    if (nsFields.length === 0) {
      out[out.length - 1] = out[out.length - 1].replace(/;$/, '.');
    } else {
      nsFields.forEach((field, idx) => {
        const isLast = idx === nsFields.length - 1;
        const lines = fieldToProps(field);
        out.push(`  sh:property [`);
        lines.forEach((l, i) => {
          out.push(`    ${l}${i === lines.length - 1 ? '' : ' ;'}`);
        });
        out.push(`  ]${isLast ? ' .' : ' ;'}`);
      });
    }
  }

  return out.join('\n');
}

// Light syntax highlighter — escape HTML, then wrap tokens.
export function highlightTurtle(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = text.split('\n');
  return lines
    .map((line) => {
      const cIdx = line.indexOf('#');
      let pre = line;
      let comment = '';
      if (cIdx >= 0 && !line.slice(0, cIdx).match(/"/)) {
        pre = line.slice(0, cIdx);
        comment = `<span class="tok-comment">${esc(line.slice(cIdx))}</span>`;
      }
      pre = esc(pre).replace(
        /&quot;([^&]*?)&quot;/g,
        '<span class="tok-str">"$1"</span>',
      );
      pre = pre.replace(/\b(\d+)\b/g, '<span class="tok-num">$1</span>');
      pre = pre.replace(
        /(@prefix)\s+([\w-]*):/g,
        '<span class="tok-prefix">$1</span> <span class="tok-subj">$2:</span>',
      );
      pre = pre.replace(
        /\b(sh|dash|rdfs|rdf|dcat|dct|foaf|xsd):([A-Za-z][\w-]*)/g,
        (_m, ns: string, term: string) => {
          const cls = ns === 'sh' || ns === 'dash' ? 'tok-pred' : 'tok-class';
          return `<span class="${cls}">${ns}:${term}</span>`;
        },
      );
      return pre + comment;
    })
    .join('\n');
}
