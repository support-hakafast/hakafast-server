import React from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';

const OPTIONS = [
  { code: 'he', labelKey: 'lang_he' },
  { code: 'en', labelKey: 'lang_en' },
  { code: 'ar', labelKey: 'lang_ar' },
];

export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang, t } = useLanguage();

  return (
    <div className={`hf-lang-switch ${className}`.trim()} role="group" aria-label="Language">
      {OPTIONS.map(({ code, labelKey }) => (
        <button
          key={code}
          type="button"
          className={`hf-lang-btn${lang === code ? ' is-active' : ''}`}
          onClick={() => setLang(code)}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
