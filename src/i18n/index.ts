/** English and Hindi strings. Switching language takes effect instantly, without a restart. */
import en from './en.json';
import hi from './hi.json';

export type Lang = 'en' | 'hi';
export const LANGUAGES: { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी' },
];

const TABLES: Record<Lang, Record<string, string>> = { en, hi };
let current: Lang = 'en';

export function setLanguage(lang: string): void {
  current = lang === 'hi' ? 'hi' : 'en';
}

export function language(): Lang {
  return current;
}

/** Translated text for `key`, with {0}, {1} or {0:.1f} filled from `args`. */
export function t(key: string, ...args: (string | number)[]): string {
  const text = TABLES[current][key] ?? TABLES.en[key] ?? key;
  if (!args.length) return text;
  return text.replace(/\{(\d+)(?::\.(\d+)f)?\}/g, (match, i: string, digits?: string) => {
    const value = args[Number(i)];
    if (value === undefined) return match;
    return digits !== undefined && typeof value === 'number' ? value.toFixed(Number(digits)) : String(value);
  });
}
