import React from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import { getModule, moduleInclusionLabel, addonPrice } from '../data/modules.js';
import { TIER_ORDER, formatIls } from '../data/pricing.js';
import '../assets/SalesPages.css';

export default function ModuleGuidePage() {
  const { moduleId } = useParams();
  const { t } = useLanguage();
  const mod = getModule(moduleId);

  if (!mod) return <Navigate to="/modules" replace />;

  return (
    <div className="sales-page">
      <header className="sales-nav">
        <HakafastLogo to="/" />
        <div className="sales-nav-end">
          <Link to="/modules">{t('mod_catalog_title')}</Link>
          <Link to="/quote">{t('nav_quote')}</Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="sales-main">
        <p className="mod-breadcrumb">
          <Link to="/modules">{t('mod_catalog_title')}</Link>
          {' / '}
          {t(mod.nameKey)}
        </p>
        <h1>{t(mod.nameKey)}</h1>
        <p className="sales-lead">{t(mod.descKey)}</p>

        {mod.hardwareNoteKey && (
          <section className="sales-info-box">
            <p>{t(mod.hardwareNoteKey)}</p>
          </section>
        )}
        {mod.notHardwareKey && (
          <section className="sales-info-box sales-info-primary">
            <p>{t(mod.notHardwareKey)}</p>
          </section>
        )}

        <section className="sales-info-box">
          <h3>{t('mod_guide_inclusion_title')}</h3>
          <ul className="sales-bullet-list">
            {TIER_ORDER.map((tier) => {
              const label = moduleInclusionLabel(mod, tier);
              let text = t('mod_inclusion_none');
              if (label === 'included') text = t('mod_inclusion_included');
              if (label === 'addon') {
                text = mod.addonKey
                  ? t('mod_inclusion_addon_price', { price: formatIls(addonPrice(mod.addonKey)) })
                  : t('mod_label_addon');
              }
              if (label === 'partner') text = t('mod_label_partner');
              if (label === 'upgrade') text = t('mod_inclusion_upgrade', { tier: 'Pro' });
              return <li key={tier}><strong>{tier}:</strong> {text}</li>;
            })}
          </ul>
        </section>

        <section className="sales-quote-box">
          <h2>{t('mod_guide_steps_title')}</h2>
          <ol className="install-steps mod-guide-steps">
            {(mod.guideSteps || []).map((stepKey, idx) => (
              <li key={stepKey} className="install-step">
                <div className="install-step-head">
                  <span className="install-step-num">{idx + 1}</span>
                  <strong>{t(`${stepKey}_title`)}</strong>
                </div>
                <p>{t(`${stepKey}_body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="mod-guide-actions">
          {mod.demoRoute && (
            <Link className="sales-cta-link" to={mod.demoRoute}>{t('mod_open_demo')}</Link>
          )}
          {mod.tryRoute && (
            <Link className="btn-muted mod-guide-try" to={mod.tryRoute} target="_blank" rel="noopener noreferrer">
              {t('mod_try_live')}
            </Link>
          )}
          <Link className="btn-muted mod-guide-try" to="/quote">{t('mod_goto_quote')}</Link>
        </div>
      </main>
    </div>
  );
}
