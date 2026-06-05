import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import translations from './translations.json';

const RTL_LANGS = new Set(['he', 'ar']);
const SUPPORTED = ['he', 'en', 'ar'];

const LanguageContext = createContext(null);

function readStoredLang() {
  try {
    const stored = localStorage.getItem('hf_lang');
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  return 'he';
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLang);

  const dict = useMemo(() => translations[lang] || translations.he, [lang]);
  const dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem('hf_lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang, dir]);

  const setLang = (next) => {
    if (SUPPORTED.includes(next)) setLangState(next);
  };

  const t = (key, vars) => {
    let text = dict[key] ?? translations.en[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replaceAll(`{{${k}}}`, String(v));
      });
    }
    return text;
  };

  const value = useMemo(() => ({ lang, dir, setLang, t }), [lang, dir, dict]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
