import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import BookingDecisionBox from './BookingDecisionBox.jsx';
import HardwareHighlightBox from './HardwareHighlightBox.jsx';
import {
  CATALOG_MODULES,
  MODULE_CATEGORIES,
  moduleInclusionLabel,
  addonPrice,
} from '../data/modules.js';
import { TIER_ORDER, formatIls } from '../data/pricing.js';
import '../assets/SalesPages.css';

const CATEGORY_ORDER = ['hardware', 'core', 'operations', 'booking', 'payment'];

function inclusionCell(mod, tier, t) {
  const label = moduleInclusionLabel(mod, tier);
  if (label === 'included') return <span className="mod-cell mod-cell--yes">✓</span>;
  if (label === 'addon') {
    const price = mod.addonKey ? formatIls(addonPrice(mod.addonKey)) : '';
    return <span className="mod-cell mod-cell--addon">{t('mod_label_addon')}{price ? ` ${price}` : ''}</span>;
  }
  if (label === 'partner') return <span className="mod-cell mod-cell--partner">{t('mod_label_partner')}</span>;
  return <span className="mod-cell mod-cell--no">—</span>;
}

export default function ModulesCatalogPage() {
  const { t } = useLanguage();

  return (
    <div className="sales-page">
      <header className="sales-nav">
        <HakafastLogo to="/" />
        <div className="sales-nav-end">
          <Link to="/quote">{t('nav_quote')}</Link>
          <Link to="/">{t('nav_home')}</Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="sales-main sales-main-wide">
        <h1>{t('mod_catalog_title')}</h1>
        <p className="sales-lead">{t('mod_catalog_lead')}</p>

        <HardwareHighlightBox t={t} />
        <BookingDecisionBox t={t} />

        {CATEGORY_ORDER.filter((cat) => MODULE_CATEGORIES.includes(cat)).map((cat) => {
          const items = CATALOG_MODULES.filter((m) => m.category === cat);
          if (!items.length) return null;
          return (
            <section key={cat} className="mod-category-section">
              <h2>{t(`mod_cat_${cat}`)}</h2>
              <div className="mod-table-wrap">
                <table className="mod-matrix-table">
                  <thead>
                    <tr>
                      <th>{t('mod_col_module')}</th>
                      <th>Standard</th>
                      <th>Pro</th>
                      <th>Enterprise</th>
                      <th>{t('mod_col_guide')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((mod) => (
                      <tr key={mod.id}>
                        <td>
                          <strong>{t(mod.nameKey)}</strong>
                          <p className="mod-desc">{t(mod.descKey)}</p>
                          {mod.hardwareNoteKey && (
                            <p className="mod-note">{t(mod.hardwareNoteKey)}</p>
                          )}
                        </td>
                        {TIER_ORDER.map((tier) => (
                          <td key={tier}>{inclusionCell(mod, tier, t)}</td>
                        ))}
                        <td className="mod-guide-links">
                          <Link to={`/modules/${mod.id}`}>{t('mod_open_guide')}</Link>
                          {mod.demoRoute && (
                            <>
                              <br />
                              <Link to={mod.demoRoute}>{t('mod_open_demo')}</Link>
                            </>
                          )}
                          {mod.tryRoute && !mod.demoRoute && (
                            <>
                              <br />
                              <Link to={mod.tryRoute} target="_blank" rel="noopener noreferrer">
                                {t('mod_try_live')}
                              </Link>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <section className="sales-quote-box">
          <h2>{t('mod_payment_faq_title')}</h2>
          <p>{t('mod_payment_faq_body')}</p>
          <Link className="sales-cta-link" to="/demo/payment">{t('mod_payment_demo_cta')}</Link>
        </section>

        <p className="sales-note">
          <Link to="/quote">{t('mod_goto_quote')}</Link>
        </p>
      </main>
    </div>
  );
}
