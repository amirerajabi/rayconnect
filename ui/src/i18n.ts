import type { Language } from '../../shared/protocol';
import { FA } from './i18n-fa';
import { useEngine } from './store/engine';

/**
 * UI text in English (the default) or Persian. Strings are written in English in the code and looked up by that text,
 * so the code stays readable and a missing translation falls back to English instead of a key name. `{name}` holes are
 * filled from `vars`. Messages that come from the engine (errors, log lines) stay English.
 */
const KEY = 'raylit.language';

let current: Language = readStored();

function readStored(): Language {
  try {
    return localStorage.getItem(KEY) === 'fa' ? 'fa' : 'en';
  } catch {
    return 'en';
  }
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const s = current === 'fa' ? (FA[text] ?? text) : text;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : s;
}

export function language(): Language {
  return current;
}

/** Direction and font follow the language on <html>; also used before settings load, from the last run. */
export function applyLanguage(lang: Language): void {
  current = lang;
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'fa' ? 'rtl' : 'ltr';
  root.classList.toggle('lang-fa', lang === 'fa');
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* private mode */
  }
}

/** Re-render on language change and return `t`. Call it at the top of every component that shows text. */
export function useT(): typeof t {
  useEngine((s) => s.settings?.language);
  return t;
}

applyLanguage(current);
// Synchronous with the store update, so components re-render with the new language already in place.
useEngine.subscribe((s) => {
  const lang = s.settings?.language;
  if (lang && lang !== current) applyLanguage(lang);
});
