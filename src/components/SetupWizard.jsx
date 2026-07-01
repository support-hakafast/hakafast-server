import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/SetupWizard.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import { fetchInstallConfig } from '../utils/installMode.js';
import { setInstallWorkspaceId } from '../utils/workspace.js';
import { isStrongPassword } from '../utils/password.js';

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'kart-demo';
}

export default function SetupWizard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [trackName, setTrackName] = useState('');
  const [trackSlug, setTrackSlug] = useState('kart-demo');
  const [kartNumbers, setKartNumbers] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneUrls, setDoneUrls] = useState(null);

  useEffect(() => {
    fetchInstallConfig().then((cfg) => {
      if (cfg?.setupComplete && cfg?.config?.trackSlug) {
        navigate(`/admin/${cfg.config.trackSlug}`, { replace: true });
        return;
      }
      if (cfg?.config?.trackName) setTrackName(cfg.config.trackName);
      if (cfg?.config?.trackSlug) setTrackSlug(cfg.config.trackSlug);
      setLoading(false);
    });
  }, [navigate]);

  const onTrackNameChange = (value) => {
    setTrackName(value);
    if (!trackSlug || trackSlug === 'kart-demo') {
      setTrackSlug(slugify(value));
    }
  };

  const submitSetup = async () => {
    setError('');
    if (!trackName.trim()) {
      setError(t('setup_error_track_required'));
      return;
    }
    if (adminPassword && !isStrongPassword(adminPassword)) {
      setError(t('setup_error_password'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/install/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          trackSlug: slugify(trackSlug || trackName),
          trackName: trackName.trim(),
          kartNumbers: kartNumbers.trim(),
          adminPassword: adminPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(t(`setup_error_${data.error}`) || t('setup_error_generic'));
        return;
      }
      await fetchInstallConfig(true);
      if (data.config?.workspaceId) setInstallWorkspaceId(data.config.workspaceId);
      if (adminPassword.trim()) {
        await fetch('/api/admin/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ password: adminPassword.trim() }),
        });
      }
      setDoneUrls(data);
      setStep(3);
    } catch {
      setError(t('setup_error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="setup-page"><p className="setup-muted">{t('setup_loading')}</p></div>;
  }

  return (
    <div className="setup-page">
      <header className="setup-header">
        <HakafastLogo to="/setup" className="setup-logo" />
        <LanguageSwitcher />
      </header>

      <main className="setup-card">
        <h1>{t('setup_title')}</h1>
        <p className="setup-lead">{t('setup_lead')}</p>

        {step === 1 && (
          <>
            <label className="setup-label">{t('setup_track_name')}</label>
            <input
              className="setup-input"
              value={trackName}
              onChange={(e) => onTrackNameChange(e.target.value)}
              placeholder={t('setup_track_name_ph')}
            />
            <label className="setup-label">{t('setup_track_slug')}</label>
            <input
              className="setup-input"
              value={trackSlug}
              onChange={(e) => setTrackSlug(slugify(e.target.value))}
              dir="ltr"
            />
            <button type="button" className="setup-btn" onClick={() => setStep(2)}>
              {t('setup_next')}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <label className="setup-label">{t('setup_karts')}</label>
            <p className="setup-muted setup-optional-hint">{t('setup_karts_optional_hint')}</p>
            <textarea
              className="setup-input setup-textarea"
              value={kartNumbers}
              onChange={(e) => setKartNumbers(e.target.value)}
              placeholder={t('setup_karts_ph')}
            />
            <label className="setup-label">{t('setup_password')}</label>
            <input
              className="setup-input"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder={t('setup_password_ph')}
            />
            {error && <p className="setup-error">{error}</p>}
            <div className="setup-actions">
              <button type="button" className="setup-btn setup-btn-secondary" onClick={() => setStep(1)}>
                {t('setup_back')}
              </button>
              <button type="button" className="setup-btn" disabled={submitting} onClick={submitSetup}>
                {submitting ? t('setup_saving') : t('setup_finish')}
              </button>
            </div>
          </>
        )}

        {step === 3 && doneUrls && (
          <>
            <p className="setup-success">{t('setup_done')}</p>
            <section className="setup-urls">
              <h2>{t('setup_urls_title')}</h2>
              <div className="setup-url-row">
                <span>{t('setup_url_admin')}</span>
                <a href={doneUrls.adminUrl}>{doneUrls.adminUrl}</a>
              </div>
              <div className="setup-url-row">
                <span>{t('setup_url_live')}</span>
                <a href={doneUrls.liveTimingUrl}>{doneUrls.liveTimingUrl}</a>
              </div>
              {(doneUrls.networkUrls || []).map((url) => (
                <div key={url} className="setup-url-row">
                  <span>{t('setup_url_lan')}</span>
                  <a href={`${url}/live-timing/${slugify(trackSlug)}`}>{url}</a>
                </div>
              ))}
            </section>
            <button
              type="button"
              className="setup-btn"
              onClick={() => navigate(`/admin/${slugify(trackSlug)}`, { replace: true })}
            >
              {t('setup_open_admin')}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
