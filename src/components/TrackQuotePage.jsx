import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import {
  PRICING,
  formatIls,
  quoteTotal,
  supportYearly,
  tierForKartCount,
  nextTier,
  upgradeCostToNext,
} from '../data/pricing.js';
import '../assets/SalesPages.css';

const SUPPORT_EMAIL = 'support.hakafast@gmail.com';

export default function TrackQuotePage() {
  const { t } = useLanguage();
  const [trackName, setTrackName] = useState('');
  const [contactName, setContactName] = useState('');
  const [kartCount, setKartCount] = useState('');
  const [includeSupport, setIncludeSupport] = useState(false);

  const kartNum = parseInt(kartCount, 10);
  const hasValidKarts = !Number.isNaN(kartNum) && kartNum >= 1;

  const activeTier = useMemo(
    () => (hasValidKarts ? tierForKartCount(kartNum) : null),
    [hasValidKarts, kartNum],
  );

  const totals = activeTier ? quoteTotal(activeTier, includeSupport) : null;
  const lic = activeTier ? PRICING.license[activeTier] : null;
  const next = activeTier ? nextTier(activeTier) : null;
  const nextUpgradeCost = activeTier ? upgradeCostToNext(activeTier) : null;

  const mailSubject = encodeURIComponent(
    `${t('quote_email_subject')}${trackName ? ` — ${trackName}` : ''}`,
  );
  const mailBody = encodeURIComponent(
    [
      trackName ? `${t('form_track')}: ${trackName}` : '',
      contactName ? `${t('form_name')}: ${contactName}` : '',
      hasValidKarts ? `${t('quote_kart_count')}: ${kartNum}` : '',
      activeTier ? `${t('quote_tier')}: ${activeTier} (${lic.karts})` : '',
      totals ? `${t('quote_total')}: ${formatIls(totals.total)}` : '',
    ].filter(Boolean).join('\n'),
  );

  return (
    <div className="sales-page">
      <header className="sales-nav">
        <HakafastLogo to="/" />
        <div className="sales-nav-end">
          <Link to="/">{t('nav_home')}</Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="sales-main">
        <h1>{t('quote_page_title')}</h1>
        <p className="sales-lead">{t('quote_page_lead')}</p>

        <section className="sales-info-box sales-info-primary">
          <p>{t('quote_audience_note')}</p>
          <a className="sales-cta-link" href={`mailto:${SUPPORT_EMAIL}?subject=${mailSubject}&body=${mailBody}`}>
            {t('quote_contact_cta')} — {SUPPORT_EMAIL}
          </a>
        </section>

        <section className="sales-form-grid">
          <label>
            {t('form_track')}
            <input
              value={trackName}
              onChange={(e) => setTrackName(e.target.value)}
              placeholder={t('quote_track_placeholder')}
            />
          </label>
          <label>
            {t('form_name')}
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder={t('quote_contact_placeholder')}
            />
          </label>
          <label className="sales-form-full">
            {t('quote_kart_count')}
            <input
              type="number"
              min="1"
              required
              value={kartCount}
              onChange={(e) => setKartCount(e.target.value)}
              placeholder={t('quote_kart_placeholder')}
            />
            <span className="sales-field-hint">{t('quote_kart_hint')}</span>
          </label>
        </section>

        {hasValidKarts && activeTier && (
          <>
            <section className="sales-tier-box">
              <h3>{t('quote_tier_auto')}</h3>
              <p className="sales-tier-name">
                <strong>{activeTier}</strong>
                <span> ({lic.karts} {t('quote_karts')})</span>
              </p>
              <p className="sales-note">{t('quote_tier_locked_hint')}</p>
              {next && nextUpgradeCost != null && (
                <p className="sales-upgrade-note">
                  {t('quote_upgrade_future', {
                    next,
                    karts: lic.maxKarts,
                    cost: formatIls(nextUpgradeCost),
                  })}
                </p>
              )}
            </section>

            <label className="sales-checkbox sales-form-full">
              <input
                type="checkbox"
                checked={includeSupport}
                onChange={(e) => setIncludeSupport(e.target.checked)}
              />
              {t('quote_include_support')} ({formatIls(supportYearly(activeTier))}/{t('quote_per_year')})
            </label>

            <section className="sales-info-box">
              <h3>{t('quote_support_includes_title')}</h3>
              <ul className="sales-bullet-list">
                <li>{t('quote_support_includes_1')}</li>
                <li>{t('quote_support_includes_2')}</li>
                <li>{t('quote_support_includes_3')}</li>
                <li>{t('quote_support_includes_4')}</li>
                <li>{t('quote_support_excludes')}</li>
              </ul>
            </section>

            <section className="sales-info-box sales-value-box">
              <p>{t('quote_value_compare')}</p>
            </section>
          </>
        )}

        {hasValidKarts && activeTier && totals && (
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
            <a className="sales-cta-link" href={`mailto:${SUPPORT_EMAIL}?subject=${mailSubject}&body=${mailBody}`}>
              {t('quote_send_request')} — {SUPPORT_EMAIL}
            </a>
          </section>
        )}

        {!hasValidKarts && (
          <section className="sales-info-box">
            <p>{t('quote_enter_karts_first')}</p>
          </section>
        )}
      </main>
    </div>
  );
}
