import en from './en';
import ptBR from './pt-BR';

export type Locale = 'en' | 'pt-BR';

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'pt-BR', label: 'PT' },
];

// English is the source of truth; other locales may be partial and fall back to it.
export const messages: Record<Locale, Record<string, unknown>> = {
  en,
  'pt-BR': ptBR,
};
