import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import { INSTALL_STEPS } from '../data/pricing.js';
import '../assets/SalesPages.css';

export default function InstallGuidePage() {
  const { t } = useLanguage();
  const totalMin = 480 + 120 + 360 + 120 + 360 + 30;

  return (
    <div className="sales-page">
      <header className="sales-nav">
        <HakafastLogo to="/" />
        <div className="sales-nav-end">
          <Link to="/quote">{t('nav_quote')}</Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="sales-main">
        <h1>{t('install_guide_title')}</h1>
        <p className="sales-lead">{t('install_guide_lead')}</p>
        <p className="sales-total-time">{t('install_total_time')}: ~{Math.round(totalMin / 60)} {t('install_hours')}</p>

        <ol className="install-steps">
          {INSTALL_STEPS.map((step, idx) => (
            <li key={step.id} className="install-step">
              <div className="install-step-head">
                <span className="install-step-num">{idx + 1}</span>
                <strong>{t(step.titleKey)}</strong>
                <span className="install-step-time">{t(step.durationKey)}</span>
              </div>
              <p>{t(step.detailKey)}</p>
            </li>
          ))}
        </ol>

        <section className="sales-quote-box">
          <h2>{t('install_checklist_title')}</h2>
          <ul>
            <li>{t('install_check_1')}</li>
            <li>{t('install_check_2')}</li>
            <li>{t('install_check_3')}</li>
            <li>{t('install_check_4')}</li>
            <li>{t('install_check_5')}</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
