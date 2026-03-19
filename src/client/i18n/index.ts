import { zh } from './zh';
import { en } from './en';

export type Locale = 'zh' | 'en';

type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends object ? DeepString<T[K]> : T[K];
};

export type Translations = DeepString<typeof zh>;

const locales: Record<Locale, Translations> = { zh, en };

export function getTranslations(locale: Locale): Translations {
  return locales[locale];
}

export { zh, en };
