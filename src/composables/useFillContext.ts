// What the form widgets need while filling in a record (Record tab). Provided
// by RecordPane, injected by PreviewField / FieldInput / LookupInput; absent in
// the plain Form Preview, which keeps those components stateless.
import type { InjectionKey } from 'vue';
import type { Field } from '../types';
import type { LookupItem } from '../lookup';
import type { RecordIssue, RecordValue } from '../record';

export interface FillContext {
  /** Lookup candidates for a reference field, filtered by its sh:class. */
  search(field: Field, text: string): LookupItem[];
  /** Remote results for a field with a lookup source; null when it has none. */
  remote(field: Field, text: string, signal: AbortSignal): Promise<LookupItem[]> | null;
  /** A known item (any source) for an entered IRI or CURIE, to show its label. */
  describe(field: Field, value: string): LookupItem | undefined;
  /** Issues at a field location (`key` or `parent/index/key`). */
  issuesAt(loc: string): RecordIssue[];
  issueText(issue: RecordIssue): string;
  newEntry(field: Field): RecordValue;
}

export const FILL_CONTEXT: InjectionKey<FillContext> = Symbol('contour.fill');
