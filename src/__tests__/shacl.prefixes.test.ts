import { describe, it, expect } from 'vitest';
import { EXAMPLES } from '../data';
import { generateShacl, parseShacl, serializeSchema } from '../shacl';
import { parseRdf } from '../rdf';
import type { Schema } from '../types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const dataset = (): Schema => clone(EXAMPLES.find((e) => e.id === 'dataset')!.schema);

describe('generated Turtle declares the standard prefixes it uses', () => {
  it('parses even when the schema declares none of them', () => {
    const s = dataset();
    s.prefixes = s.prefixes.filter((p) => !['sh', 'dash', 'rdfs', 'dct', 'xsd', 'rdf'].includes(p.prefix));
    const ttl = generateShacl(s);
    expect(parseRdf(ttl, 'turtle').error).toBeNull();
    for (const p of ['sh', 'dash', 'rdfs', 'dct', 'xsd']) expect(ttl).toContain(`@prefix ${p}: <`);
    expect(serializeSchema(s, 'ntriples')).toContain('<http://www.w3.org/ns/shacl#NodeShape>');
    expect(parseShacl(ttl).schema!.groups.flatMap((g) => g.fields)).toHaveLength(7);
  });

  it('adds only what is used, and leaves complete schemas unchanged', () => {
    const s = dataset();
    expect(generateShacl(s)).toBe(generateShacl(clone(s))); // deterministic
    const before = generateShacl(s);
    expect(before.match(/@prefix /g)!.length).toBe(s.prefixes.length);
    const bare: Schema = { ...s, prefixes: [{ prefix: '', uri: 'https://x.org/' }], groups: [], nestedShapes: [], schemaName: '', schemaDescription: '' };
    const ttl = generateShacl(bare);
    expect(ttl).toContain('@prefix sh: <');
    expect(ttl).not.toContain('@prefix dct:');
    expect(ttl).not.toContain('@prefix rdfs:');
  });

  it('does not redeclare an alias the schema already uses for another namespace', () => {
    const s = dataset();
    s.prefixes = s.prefixes.map((p) => (p.prefix === 'dct' ? { prefix: 'dct', uri: 'https://other.org/' } : p));
    const ttl = generateShacl(s);
    expect(ttl.match(/@prefix dct:/g)).toHaveLength(1);
  });
});
