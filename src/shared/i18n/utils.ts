import ru from './ru.json';
import en from './en.json';

export const languages = {
  ru: 'Русский',
  en: 'English',
};

export const defaultLang = 'ru';

export const ui = {
  ru,
  en,
} as const;

export type Lang = keyof typeof ui;

export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split('/');
  if (lang in ui) return lang as Lang;
  return defaultLang;
}

export function useTranslations(lang: Lang) {
  return function t(key: string): any {
    const keys = key.split('.');
    let value: any = ui[lang];

    for (const k of keys) {
      if (value === undefined) break;
      value = value[k];
    }

    if (value === undefined) {
      let fallbackValue: any = ui[defaultLang];
      for (const k of keys) {
        if (fallbackValue === undefined) break;
        fallbackValue = fallbackValue[k];
      }
      return fallbackValue || key;
    }

    return value;
  };
}

export function useTranslatedPath(lang: Lang) {
  return function translatePath(path: string, l: string = lang) {
    // If the path already starts with a locale, replace it or keep it depending on logic,
    // but assuming simple paths like `/about` or `/`
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `/${l}${cleanPath === '/' ? '' : cleanPath}`;
  };
}
