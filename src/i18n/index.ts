// The app's interface language. The English text is the key: `t` shows its
// translation in the chosen language, or the English when there is none.
// Story text is never translated here; the storyteller writes in the
// story's own language.
import { createElement, Fragment, type ReactNode } from 'react';
import { create } from 'zustand';
import { MESSAGES } from './messages';

export type Locale = 'en' | 'zh-Hans' | 'zh-Hant' | 'ja' | 'ko';
export type LanguageChoice = 'auto' | Locale;

/** The order of the translations in each message entry. */
export const TRANSLATED = ['zh-Hans', 'zh-Hant', 'ja', 'ko'] as const;

/** Each language named in itself, as the language picker shows it. */
export const LANGUAGES: { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'zh-Hans', name: '简体中文' },
  { id: 'zh-Hant', name: '繁體中文' },
  { id: 'ja', name: '日本語' },
  { id: 'ko', name: '한국어' },
];

const STORAGE_KEY = 'dtl.uiLanguage';
const INTL: Record<Locale, string> = {
  en: 'en',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  ja: 'ja-JP',
  ko: 'ko-KR',
};

/** The first of the system's languages the app has, or English. */
export function systemLocale(languages?: readonly string[]): Locale {
  const list =
    languages ??
    (typeof navigator === 'undefined'
      ? []
      : navigator.languages.length
        ? navigator.languages
        : [navigator.language]);
  for (const raw of list) {
    const l = raw.toLowerCase();
    if (l.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('ko')) return 'ko';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

function isChoice(v: unknown): v is LanguageChoice {
  return v === 'auto' || LANGUAGES.some((l) => l.id === v);
}

function loadChoice(): LanguageChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isChoice(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let current: Locale = 'en';
let column = -1;

function apply(l: Locale) {
  current = l;
  column = TRANSLATED.indexOf(l as (typeof TRANSLATED)[number]);
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

type LanguageState = {
  choice: LanguageChoice;
  locale: Locale;
  setChoice: (choice: LanguageChoice) => void;
};

/** The chosen language. The app re-renders from the top when it changes. */
export const useLanguage = create<LanguageState>((set) => {
  const choice = loadChoice();
  const locale = choice === 'auto' ? systemLocale() : choice;
  apply(locale);
  return {
    choice,
    locale,
    setChoice: (next) => {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // A preference only; the choice still applies until the app closes.
      }
      const l = next === 'auto' ? systemLocale() : next;
      apply(l);
      set({ choice: next, locale: l });
    },
  };
});

export function locale(): Locale {
  return current;
}

/** The BCP 47 tag for dates and numbers in the chosen language. */
export function intlLocale(): string {
  if (current === 'en' && typeof navigator !== 'undefined' && navigator.language.startsWith('en')) {
    return navigator.language;
  }
  return INTL[current];
}

type Vars = Record<string, string | number>;

function lookup(key: string): string {
  if (column < 0) return key;
  return MESSAGES[key]?.[column] || key;
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Marks English text translated later with `t(variable)`, e.g. in tables. */
export function msg<T extends string>(text: T): T {
  return text;
}

/** The text in the chosen language, with `{name}` filled from `vars`. */
export function t(key: string, vars?: Vars): string {
  return fill(lookup(key), vars);
}

/**
 * A count: English picks `one` or `many`; other languages translate `many`
 * (they don't change the noun). `{n}` is the count.
 */
export function tn(n: number, one: string, many: string, vars?: Vars): string {
  const key = column < 0 && n === 1 ? one : many;
  return fill(lookup(key), { n: n.toLocaleString(intlLocale()), ...vars });
}

/** Like `t`, but `{name}` can be an element, e.g. `{ label: <strong>…</strong> }`. */
export function tr(key: string, vars: Record<string, ReactNode>): ReactNode {
  const text = lookup(key);
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    const name = m[1]!;
    if (!(name in vars)) continue;
    out.push(text.slice(last, m.index));
    out.push(createElement(Fragment, { key: i++ }, vars[name]));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return createElement(Fragment, null, ...out);
}

/** Choices marked with `msg`, with their labels and hints translated. */
export function tOptions<T extends { label: string; hint?: string }>(options: readonly T[]): T[] {
  return options.map((o) => ({
    ...o,
    label: lookup(o.label),
    ...(o.hint ? { hint: lookup(o.hint) } : {}),
  }));
}

/** Text the app's core sends in English, translated when it is known. */
export function tKnown(text: string): string {
  return lookup(text);
}

/** Sentences joined the way the chosen language joins them. */
export function joinSentences(parts: string[]): string {
  return parts.join(current === 'zh-Hans' || current === 'zh-Hant' || current === 'ja' ? '' : ' ');
}

/** A date and time in the chosen language ("7 Nov 2026, 01:02"); `iso` when it is not a date. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

/** A list joined the way the chosen language lists things ("a, b" / "a、b"). */
export function joinList(parts: string[]): string {
  return parts.join(t(', '));
}
