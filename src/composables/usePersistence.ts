// Local-only persistence: an autosaved draft (so a refresh never loses work)
// and a small list of recently saved schemas. Consistent with Contour's
// zero-backend design — everything lives in localStorage and degrades silently
// when storage is unavailable (file://, privacy mode).
import type { Schema } from './../types';

const DRAFT_KEY = 'contour.draft';
const RECENT_KEY = 'contour.recent';
const RECENT_LIMIT = 8;

export interface RecentEntry {
  name: string;
  savedAt: number;
  schema: Schema;
}

function schemaHasContent(s: Schema): boolean {
  return (
    !!s.schemaName ||
    (s.groups || []).some((g) => g.fields.length > 0) ||
    (s.nestedShapes || []).length > 0
  );
}

export function loadDraft(): Schema | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Schema;
    return schemaHasContent(s) ? s : null;
  } catch {
    return null;
  }
}

export function saveDraft(schema: Schema): void {
  try {
    if (schemaHasContent(schema)) localStorage.setItem(DRAFT_KEY, JSON.stringify(schema));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function listRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Record a saved schema at the top of the recents list (de-duped by name). */
export function addRecent(schema: Schema): void {
  try {
    const name = schema.schemaName || 'Untitled schema';
    const entry: RecentEntry = { name, savedAt: Date.now(), schema: JSON.parse(JSON.stringify(schema)) };
    const next = [entry, ...listRecent().filter((e) => e.name !== name)].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
