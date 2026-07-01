import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import {
  PRICING,
  formatIls,
  quoteTotal,
  carePlanYearly,
  tierForKartCount,
  nextTier,
  upgradeCostToNext,
  TIER_ORDER,
} from '../data/pricing.js';
import {
  CATALOG_MODULES,
  QUOTE_ADDON_MODULES,
  moduleInclusionLabel,
  addonPrice,
} from '../data/modules.js';
import BookingDecisionBox from './BookingDecisionBox.jsx';
import HardwareHighlightBox from './HardwareHighlightBox.jsx';
import '../assets/SalesPages.css';

const SUPPORT_EMAIL = 'support.hakafast@gmail.com';

const initialAddons = () =>
  Object.fromEntries(QUOTE_ADDON_MODULES.map((m) => [m.addonKey, false]));

export default function TrackQuotePage() {
  const { t } = useLanguage();
  const [trackName, setTrackName] = useState('');
  const [contactName, setContactName] = useState('');
  const [kartCount, setKartCount] = useState('');
  const [includeCarePlan, setIncludeCarePlan] = useState(false);
  const [addons, setAddons] = useState(initialAddons);

  const kartNum = parseInt(kartCount, 10);
  const hasValidKarts = !Number.isNaN(kartNum) && kartNum >= 1;

  const activeTier = useMemo(
    () => (hasValidKarts ? tierForKartCount(kartNum) : null),
    [hasValidKarts, kartNum],
  );

  const totals = activeTier ? quoteTotal(activeTier, { includeCarePlan, addons }) : null;
  const lic = activeTier ? PRICING.license[activeTier] : null;
  const next = activeTier ? nextTier(activeTier) : null;
  const nextUpgradeCost = activeTier ? upgradeCostToNext(activeTier) : null;

  const optionalAddons = useMemo(
    () => (activeTier ? QUOTE_ADDON_MODULES.filter((m) => m.includedIn[activeTier] === 'addon') : []),
    [activeTier],
  );

  const toggleAddon = (key) => {
    setAddons((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const mailSubject = encodeURIComponent(
    `${t('quote_email_subject')}${trackName ? ` — ${trackName}` : ''}`,
  );
  const mailBody = encodeURIComponent(
    [
      trackName ? `${t('form_track')}: ${trackName}` : '',
      contactName ? `${t('form_name')}: ${contactName}` : '',
      hasValidKarts ? `${t('quote_kart_count')}: ${kartNum}` : '',
      activeTier ? `${t('quote_tier')}: ${activeTier} (${lic.karts})` : '',
      includeCarePlan ? `${t('quote_care_plan_year')}: ${formatIls(carePlanYearly(activeTier))}` : '',
      ...optionalAddons.filter((m) => addons[m.addonKey]).map(
        (m) => `${t(m.nameKey)}: ${formatIls(addonPrice(m.addonKey))}`,
      ),
      totals ? `${t('quote_total')}: ${formatIls(totals.total)}` : '',
    ].filter(Boolean).join('\n'),
  );

  const inclusionText = (mod, tier) => {
    const label = moduleInclusionLabel(mod, tier);
    if (label === 'included') return <span className="quote-mod-included">✓ {t('mod_inclusion_included')}</span>;
    if (label === 'addon') return <span>{t('mod_label_addon')}</span>;
    if (label === 'partner') return <span>{t('mod_label_partner')}</span>;
    const minTier = TIER_ORDER.find((tr) => mod.includedIn[tr] === true);
    return <span className="quote-mod-upgrade">{minTier ? `↑ ${minTier}` : '—'}</span>;
  };

  return (
    <div className="sales-page">
      <header className="sales-nav">
        <HakafastLogo to="/" />
        <div className="sales-nav-end">
          <Link to="/modules">{t('mod_catalog_title')}</Link>
          <Link to="/">{t('nav_home')}</Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="sales-main sales-main-wide">
        <h1>{t('quote_page_title')}</h1>
        <p className="sales-lead">{t('quote_page_lead')}</p>

        <section className="sales-info-box sales-info-primary">
          <p>{t('quote_audience_note')}</p>
          <p>{t('quote_modules_hint')}</p>
          <a className="sales-cta-link" href={`mailto:${SUPPORT_EMAIL}?subject=${mailSubject}&body=${mailBody}`}>
            {t('quote_contact_cta')} — {SUPPORT_EMAIL}
          </a>
        </section>

        <HardwareHighlightBox t={t} />

        <section className="sales-form-grid">
          <label>
            {t('form_track')}
            <input value={trackName} onChange={(e) => setTrackName(e.target.value)} placeholder={t('quote_track_placeholder')} />
          </label>
          <label>
            {t('form_name')}
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={t('quote_contact_placeholder')} />
          </label>
          <label className="sales-form-full">
            {t('quote_kart_count')}
            <input type="number" min="1" required value={kartCount} onChange={(e) => setKartCount(e.target.value)} placeholder={t('quote_kart_placeholder')} />
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
                  {t('quote_upgrade_future', { next, karts: lic.maxKarts, cost: formatIls(nextUpgradeCost) })}
                </p>
              )}
            </section>

            <BookingDecisionBox t={t} />

            <section className="sales-info-box">
              <h3>{t('quote_modules_included_title', { tier: activeTier })}</h3>
              <div className="mod-table-wrap">
                <table className="mod-matrix-table quote-mod-matrix">
                  <thead>
                    <tr>
                      <th>{t('mod_col_module')}</th>
                      <th>{t('mod_col_status')}</th>
                      <th>{t('mod_col_guide')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATALOG_MODULES.map((mod) => (
                      <tr key={mod.id} className={moduleInclusionLabel(mod, activeTier) === 'addon' ? 'quote-mod-addon-row' : ''}>
                        <td>
                          <strong>{t(mod.nameKey)}</strong>
                          <p className="mod-desc">{t(mod.descKey)}</p>
                        </td>
                        <td>{inclusionText(mod, activeTier)}</td>
                        <td className="mod-guide-links">
                          <Link to={`/modules/${mod.id}`}>{t('mod_open_guide')}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {optionalAddons.length > 0 && (
              <section className="sales-info-box">
                <h3>{t('quote_addons_title')}</h3>
                <p className="sales-note">{t('quote_addons_note')}</p>
                {optionalAddons.map((mod) => (
                  <label key={mod.id} className="sales-checkbox sales-form-full">
                    <input
                      type="checkbox"
                      checked={Boolean(addons[mod.addonKey])}
                      onChange={() => toggleAddon(mod.addonKey)}
                    />
                    {t(mod.nameKey)} ({formatIls(addonPrice(mod.addonKey))})
                    {' — '}
                    <Link to={mod.demoRoute || `/modules/${mod.id}`}>{t('mod_open_guide')}</Link>
                  </label>
                ))}
              </section>
            )}

            <p className="sales-note">{t('quote_addons_on_request')}</p>

            <label className="sales-checkbox sales-form-full">
              <input type="checkbox" checked={includeCarePlan} onChange={(e) => setIncludeCarePlan(e.target.checked)} />
              {t('quote_include_care_plan')} ({formatIls(carePlanYearly(activeTier))}/{t('quote_per_year')})
            </label>

            <section className="sales-info-box">
              <h3>{t('quote_care_plan_title')}</h3>
              <ul className="sales-bullet-list">
                <li>{t('quote_support_includes_1')}</li>
                <li>{t('quote_support_includes_2')}</li>
                <li>{t('quote_support_includes_3')}</li>
                <li>{t('quote_support_includes_4')}</li>
                <li>{t('quote_care_plan_recommended')}</li>
                <li>{t('quote_support_excludes')}</li>
              </ul>
            </section>

            <section className="sales-info-box sales-value-box">
              <p>{t('quote_value_compare')}</p>
              <p className="sales-note">{t('quote_event_day_note', { cost: formatIls(PRICING.eventDayRental) })}</p>
              <p className="sales-note">{t('quote_hardware_note')}</p>
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
                {optionalAddons.filter((m) => addons[m.addonKey]).map((mod) => (
                  <tr key={mod.id}>
                    <td>{t(mod.nameKey)}</td>
                    <td>{formatIls(addonPrice(mod.addonKey))}</td>
                  </tr>
                ))}
                {includeCarePlan && (
                  <tr><td>{t('quote_care_plan_year')}</td><td>{formatIls(carePlanYearly(activeTier))}</td></tr>
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
