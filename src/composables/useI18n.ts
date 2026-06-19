import { ref } from 'vue';
import { messages, type Locale } from '../i18n';

const STORAGE_KEY = 'contour.locale';
const DEFAULT_LOCALE: Locale = 'en';

function detectInitial(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'pt-BR') return saved;
  } catch {
    /* localStorage unavailable (e.g. file://, privacy mode) */
  }
  return DEFAULT_LOCALE;
}

// Module-level reactive locale — shared across every component that calls useI18n().
const locale = ref<Locale>(detectInitial());

export function setLocale(next: Locale): void {
  locale.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

function resolve(dict: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((obj, part) => {
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[part];
    return undefined;
  }, dict);
}

function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

export function useI18n() {
  /** Translate a dotted key, with English fallback and {param} interpolation. */
  function t(key: string, params?: Record<string, string | number>): string {
    let val = resolve(messages[locale.value], key);
    if (typeof val !== 'string') val = resolve(messages.en, key);
    if (typeof val !== 'string') return key;
    return interpolate(val, params);
  }

  /** Pluralize a { one, other } key by `n` (interpolates {n} plus any params). */
  function plural(key: string, n: number, params?: Record<string, string | number>): string {
    let entry = resolve(messages[locale.value], key);
    if (!entry || typeof entry !== 'object') entry = resolve(messages.en, key);
    const form = n === 1 ? 'one' : 'other';
    const tmpl =
      entry && typeof entry === 'object'
        ? (entry as Record<string, string>)[form]
        : undefined;
    if (typeof tmpl !== 'string') return key;
    return interpolate(tmpl, { n, ...params });
  }

  return { t, plural, locale, setLocale };
}
