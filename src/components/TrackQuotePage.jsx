import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import { PRICING, formatIls, quoteTotal, supportYearly } from '../data/pricing.js';
import '../assets/SalesPages.css';

export default function TrackQuotePage() {
  const { t } = useLanguage();
  const [trackName, setTrackName] = useState('');
  const [contactName, setContactName] = useState('');
  const [kartCount, setKartCount] = useState('');
  const [tier, setTier] = useState('Pro');
  const [includeSupport, setIncludeSupport] = useState(false);

  const suggestedTier = useMemo(() => {
    const n = parseInt(kartCount, 10);
    if (Number.isNaN(n)) return tier;
    if (n <= 15) return 'Standard';
    if (n <= 25) return 'Pro';
    return 'Enterprise';
  }, [kartCount, tier]);

  const activeTier = tier || suggestedTier;
  const totals = quoteTotal(activeTier, includeSupport);
  const lic = PRICING.license[activeTier];

  return (
    <div className="sales-page">
      <header className="sales-nav">
        <HakafastLogo to="/" />
        <div className="sales-nav-end">
          <Link to="/install-guide">{t('nav_install_guide')}</Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="sales-main">
        <h1>{t('quote_page_title')}</h1>
        <p className="sales-lead">{t('quote_page_lead')}</p>

        <section className="sales-form-grid">
          <label>
            {t('form_track')}
            <input value={trackName} onChange={(e) => setTrackName(e.target.value)} />
          </label>
          <label>
            {t('form_name')}
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </label>
          <label>
            {t('quote_kart_count')}
            <input type="number" min="1" value={kartCount} onChange={(e) => setKartCount(e.target.value)} />
          </label>
          <label>
            {t('quote_tier')}
            <select value={activeTier} onChange={(e) => setTier(e.target.value)}>
              {Object.entries(PRICING.license).map(([key, val]) => (
                <option key={key} value={key}>{key} ({val.karts})</option>
              ))}
            </select>
          </label>
          <label className="sales-checkbox">
            <input type="checkbox" checked={includeSupport} onChange={(e) => setIncludeSupport(e.target.checked)} />
            {t('quote_include_support')} ({formatIls(supportYearly(activeTier))}/{t('quote_per_year')})
          </label>
        </section>

        <section className="sales-quote-box">
          <h2>{trackName || t('quote_your_track')} — {activeTier}</h2>
          <table className="sales-table">
            <tbody>
              <tr><td>{t('quote_license_lifetime')}</td><td>{formatIls(lic.price)}</td></tr>
              <tr><td>{t('quote_install')}</td><td>{formatIls(PRICING.services.install)}</td></tr>
              <tr><td>{t('quote_training')}</td><td>{formatIls(PRICING.services.trainingDay)}</td></tr>
              {includeSupport && (
                <tr><td>{t('quote_support_year')}</td><td>{formatIls(supportYearly(activeTier))}</td></tr>
              )}
              <tr><td>{t('quote_before_vat')}</td><td><strong>{formatIls(totals.beforeVat)}</strong></td></tr>
              <tr><td>{t('quote_vat')}</td><td>{formatIls(totals.vat)}</td></tr>
              <tr className="sales-total"><td>{t('quote_total')}</td><td><strong>{formatIls(totals.total)}</strong></td></tr>
            </tbody>
          </table>
          <p className="sales-note">{t('quote_payment_terms')}</p>
          <p className="sales-note">{t('quote_validity')}</p>
          {contactName && <p className="sales-contact">{t('quote_contact_line')}: {contactName} · support.hakafast@gmail.com</p>}
        </section>
      </main>
    </div>
  );
}
