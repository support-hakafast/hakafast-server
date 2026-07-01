import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import '../assets/ResultsPage.css';
import '../assets/HeatResultsQr.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import HeatResultsQr from './HeatResultsQr.jsx';
import { apiFetch } from '../utils/apiClient.js';
import { fetchInstallConfig, getInstallTrackSlug } from '../utils/installMode.js';
import { buildHeatResultsUrl } from '../utils/resultsUrl.js';

function sortResults(results) {
  return (results || []).slice().sort((a, b) => {
    const aBest = a.best_lap_time || '99:99.999';
    const bBest = b.best_lap_time || '99:99.999';
    return aBest.localeCompare(bBest);
  });
}

export default function ResultsPage() {
  const { heatId, track } = useParams();
  const { t } = useLanguage();
  const [trackSlug, setTrackSlug] = useState(track || 'kart-demo');
  const [list, setList] = useState([]);
  const [heat, setHeat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [networkUrls, setNetworkUrls] = useState([]);

  useEffect(() => {
    fetchInstallConfig().then((cfg) => {
      if (!track && cfg?.config?.trackSlug) setTrackSlug(cfg.config.trackSlug);
      setNetworkUrls(cfg?.networkUrls || []);
    });
  }, [track]);

  const slug = track || getInstallTrackSlug(trackSlug);

  const loadList = useCallback(async () => {
    const res = await apiFetch('/api/results/list?limit=30', {}, slug);
    if (res.ok) {
      const data = await res.json();
      setList(data.heats || []);
    }
  }, [slug]);

  const loadHeat = useCallback(async (n) => {
    const res = await apiFetch(`/api/results/${n}`, {}, slug);
    if (res.ok) {
      const data = await res.json();
      setHeat(data.heat || null);
    } else {
      setHeat(null);
    }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    if (heatId) {
      loadHeat(heatId).finally(() => setLoading(false));
    } else {
      loadList().finally(() => setLoading(false));
    }
  }, [heatId, loadHeat, loadList]);

  const rows = sortResults(heat?.results);

  const heatResultsUrl = useMemo(() => {
    if (!heatId) return '';
    return buildHeatResultsUrl(heatId, networkUrls);
  }, [heatId, networkUrls]);

  return (
    <div className="results-page">
      <header className="results-header">
        <HakafastLogo to="/" className="results-logo" />
        <div className="results-header-end">
          <Link to={`/admin/${slug}`} className="results-link">{t('nav_admin')}</Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="results-main">
        <h1>{heatId ? t('results_heat_title', { n: heatId }) : t('results_title')}</h1>

        {loading && <p className="results-muted">{t('results_loading')}</p>}

        {!loading && !heatId && (
          <ul className="results-list">
            {list.map((h) => (
              <li key={h.heat_number}>
                <Link to={`/results/${h.heat_number}`}>
                  {t('results_list_item', { n: h.heat_number, count: h.driver_count })}
                </Link>
                <span className="results-meta">{h.heat_type}</span>
              </li>
            ))}
          </ul>
        )}

        {!loading && heatId && heat && (
          <>
            {heat.live && <p className="results-live">{t('results_live')}</p>}
            <table className="results-table">
              <thead>
                <tr>
                  <th>{t('pos')}</th>
                  <th>{t('kart')}</th>
                  <th>{t('driver')}</th>
                  <th>{t('best_lap')}</th>
                  <th>{t('last_lap')}</th>
                  <th>{t('laps')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.kart_number}>
                    <td>{i + 1}</td>
                    <td>{r.kart_number}</td>
                    <td>{r.driver_name || t('anonymous')}</td>
                    <td>{r.best_lap_time || '—'}</td>
                    <td>{r.last_lap_time || '—'}</td>
                    <td>{r.lap_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {heatResultsUrl && (
              <section className="results-qr-section">
                <HeatResultsQr
                  url={heatResultsUrl}
                  size={200}
                  label={t('results_qr_label', { n: heatId })}
                />
              </section>
            )}
            <Link to="/results" className="results-back">{t('results_back')}</Link>
          </>
        )}

        {!loading && heatId && !heat && (
          <p className="results-muted">{t('results_not_found')}</p>
        )}
      </main>
    </div>
  );
}
