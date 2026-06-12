import React from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';

const OPTIONS = [
  { code: 'he', labelKey: 'lang_he' },
  { code: 'en', labelKey: 'lang_en' },
  { code: 'ar', labelKey: 'lang_ar' },
];

const SHORT_LABELS = { he: 'עב', en: 'EN', ar: 'ع' };

export default function LanguageSwitcher({ className = '', compact = false }) {
  const { lang, setLang, t } = useLanguage();

  if (compact) {
    return (
      <select
        className={`hf-lang-select ${className}`.trim()}
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label="Language"
      >
        {OPTIONS.map(({ code, labelKey }) => (
          <option key={code} value={code}>
            {SHORT_LABELS[code] || t(labelKey)}
          </option>
        ))}
      </select>
    );
  }

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
