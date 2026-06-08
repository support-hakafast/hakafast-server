import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import '../assets/Reception.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import { apiFetch } from '../utils/apiClient.js';
import { fetchInstallConfig, getInstallTrackSlug } from '../utils/installMode.js';

export default function Reception() {
  const { track } = useParams();
  const { t } = useLanguage();
  const [trackSlug, setTrackSlug] = useState(track || 'kart-demo');
  const [state, setState] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [level, setLevel] = useState('Amateur');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchInstallConfig().then((cfg) => {
      if (!track && cfg?.config?.trackSlug) setTrackSlug(cfg.config.trackSlug);
    });
  }, [track]);

  const loadState = useCallback(async () => {
    const slug = track || getInstallTrackSlug(trackSlug);
    const res = await apiFetch('/api/reception/state', {}, slug);
    if (res.ok) {
      const data = await res.json();
      if (data.success !== false) setState(data);
    }
  }, [track, trackSlug]);

  useEffect(() => {
    loadState();
    const id = setInterval(loadState, 4000);
    return () => clearInterval(id);
  }, [loadState]);

  const addDriver = async (e) => {
    e.preventDefault();
    setError('');
    const slug = track || getInstallTrackSlug(trackSlug);
    const res = await apiFetch('/api/reception/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, driver_level: level }),
    }, slug);
    const data = await res.json();
    if (!data.success) {
      setError(t('reception_error_add'));
      return;
    }
    setName('');
    setPhone('');
    setState((prev) => ({ ...prev, driverQueue: data.driverQueue }));
  };

  const removeDriver = async (index) => {
    const slug = track || getInstallTrackSlug(trackSlug);
    const res = await apiFetch(`/api/reception/drivers/${index}`, { method: 'DELETE' }, slug);
    const data = await res.json();
    if (data.success) {
      setState((prev) => ({ ...prev, driverQueue: data.driverQueue }));
    }
  };

  const slug = track || trackSlug;

  return (
    <div className="reception-page">
      <header className="reception-header">
        <HakafastLogo to="/" className="reception-logo" />
        <div className="reception-header-end">
          <Link to={`/admin/${slug}`} className="reception-link">{t('nav_admin')}</Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="reception-main">
        <h1>{t('reception_title')}</h1>
        {state && (
          <div className="reception-status">
            <span>{t('reception_heat', { n: state.heatNumber ?? '—' })}</span>
            <span>{t('reception_queue_count', { n: state.driverQueue?.length || 0 })}</span>
            {state.hasActiveSession && <span className="reception-live">{t('reception_active')}</span>}
          </div>
        )}

        <form className="reception-form" onSubmit={addDriver}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('admin_driver_placeholder')}
            required
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('admin_phone_placeholder')}
          />
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="Amateur">{t('level_amateur')}</option>
            <option value="Master">{t('level_master')}</option>
            <option value="Pro">{t('level_pro')}</option>
          </select>
          <button type="submit">{t('reception_add')}</button>
        </form>
        {error && <p className="reception-error">{error}</p>}

        <ul className="reception-queue">
          {(state?.driverQueue || []).map((d, i) => (
            <li key={`${d.name}-${i}`}>
              <div>
                <strong>{d.name}</strong>
                {d.phone && <span className="reception-phone">{d.phone}</span>}
              </div>
              <button type="button" onClick={() => removeDriver(i)}>{t('reception_remove')}</button>
            </li>
          ))}
        </ul>
        {!(state?.driverQueue?.length) && <p className="reception-empty">{t('reception_empty')}</p>}
      </main>
    </div>
  );
}
