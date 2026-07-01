import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../assets/BusyDayWizard.css';
import '../assets/HeatResultsQr.css';
import { fetchInstallConfig } from '../utils/installMode.js';
import { buildHeatResultsUrl, buildResultsListUrl } from '../utils/resultsUrl.js';
import HeatResultsQr from './HeatResultsQr.jsx';
import { apiFetch } from '../utils/apiClient.js';

const STEPS = ['open', 'heat', 'results', 'close'];

export default function BusyDayWizard({
  trackSlug,
  heatNumber,
  onClose,
  onOpenPreview,
  onOpenDayPlanner,
  darkMode = false,
  t,
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [checks, setChecks] = useState({
    server: false,
    tranx: false,
    screen: false,
    reception: false,
  });
  const [networkUrls, setNetworkUrls] = useState([]);
  const [lastHeat, setLastHeat] = useState(heatNumber || null);
  const [broadcasting, setBroadcasting] = useState(false);

  const step = STEPS[stepIdx];

  useEffect(() => {
    fetchInstallConfig().then((cfg) => {
      setNetworkUrls(cfg?.networkUrls || []);
    });
  }, []);

  useEffect(() => {
    if (heatNumber) setLastHeat(heatNumber);
  }, [heatNumber]);

  const loadLastHeat = useCallback(async () => {
    const res = await apiFetch('/api/results/list?limit=5', {}, trackSlug);
    if (!res.ok) return;
    const data = await res.json();
    const heats = data.heats || [];
    if (heats.length) setLastHeat(heats[0].heat_number);
  }, [trackSlug]);

  useEffect(() => {
    if (step === 'results') loadLastHeat();
  }, [step, loadLastHeat]);

  const toggleCheck = (key) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openReady = checks.server && checks.tranx && checks.screen;

  const resultsUrl = useMemo(
    () => (lastHeat ? buildHeatResultsUrl(lastHeat, networkUrls) : buildResultsListUrl(networkUrls)),
    [lastHeat, networkUrls],
  );

  const broadcastHeat = async () => {
    if (!lastHeat) return;
    await apiFetch('/api/display-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heatNumber: lastHeat }),
    }, trackSlug);
    setBroadcasting(true);
  };

  const adminUrl = networkUrls[0]
    ? `${networkUrls[0]}/admin/${trackSlug}`
    : `/admin/${trackSlug}`;
  const liveUrl = networkUrls[0]
    ? `${networkUrls[0]}/live-timing/${trackSlug}`
    : `/live-timing/${trackSlug}`;
  const receptionUrl = networkUrls[0]
    ? `${networkUrls[0]}/reception/${trackSlug}`
    : `/reception/${trackSlug}`;

  return (
    <div className={`busy-day-overlay${darkMode ? ' busy-day-overlay--dark' : ''}`} role="dialog" aria-modal="true">
      <div className="busy-day-modal">
        <header className="busy-day-header">
          <h2>{t('busy_day_title')}</h2>
          <button type="button" className="busy-day-close" onClick={onClose} aria-label={t('close')}>×</button>
        </header>

        <nav className="busy-day-steps" aria-label={t('busy_day_steps')}>
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              className={`busy-day-step-tab${i === stepIdx ? ' is-active' : ''}${i < stepIdx ? ' is-done' : ''}`}
              onClick={() => setStepIdx(i)}
            >
              {i + 1}. {t(`busy_day_step_${s}`)}
            </button>
          ))}
        </nav>

        <div className="busy-day-body">
          {step === 'open' && (
            <>
              <p className="busy-day-lead">{t('busy_day_open_lead')}</p>
              <ul className="busy-day-checklist">
                <li>
                  <label>
                    <input type="checkbox" checked={checks.server} onChange={() => toggleCheck('server')} />
                    {t('busy_day_check_server')}
                  </label>
                </li>
                <li>
                  <label>
                    <input type="checkbox" checked={checks.tranx} onChange={() => toggleCheck('tranx')} />
                    {t('busy_day_check_tranx')}
                  </label>
                </li>
                <li>
                  <label>
                    <input type="checkbox" checked={checks.screen} onChange={() => toggleCheck('screen')} />
                    {t('busy_day_check_screen')}
                  </label>
                </li>
                <li>
                  <label>
                    <input type="checkbox" checked={checks.reception} onChange={() => toggleCheck('reception')} />
                    {t('busy_day_check_reception')}
                  </label>
                </li>
              </ul>
              <section className="busy-day-urls">
                <p className="busy-day-urls-title">{t('busy_day_lan_urls')}</p>
                <a href={liveUrl} target="_blank" rel="noopener noreferrer">{t('nav_live')} — {liveUrl}</a>
                <a href={receptionUrl} target="_blank" rel="noopener noreferrer">{t('nav_reception')} — {receptionUrl}</a>
              </section>
            </>
          )}

          {step === 'heat' && (
            <>
              <p className="busy-day-lead">{t('busy_day_heat_lead')}</p>
              <ol className="busy-day-flow">
                <li>{t('busy_day_heat_1')}</li>
                <li>{t('busy_day_heat_2')}</li>
                <li>{t('busy_day_heat_3')}</li>
              </ol>
              <div className="busy-day-actions">
                <button type="button" className="btn-primary" onClick={onOpenDayPlanner}>
                  📅 {t('admin_day_planner')}
                </button>
                <button type="button" className="btn-muted" onClick={onOpenPreview}>
                  {t('admin_preview_title')}
                </button>
                <a className="btn-muted busy-day-link-btn" href={receptionUrl} target="_blank" rel="noopener noreferrer">
                  {t('nav_reception')}
                </a>
              </div>
              {heatNumber ? (
                <p className="busy-day-status">{t('live_heat_number', { n: heatNumber })}</p>
              ) : (
                <p className="busy-day-muted">{t('busy_day_no_heat')}</p>
              )}
            </>
          )}

          {step === 'results' && (
            <>
              <p className="busy-day-lead">{t('busy_day_results_lead')}</p>
              {lastHeat ? (
                <>
                  <p className="busy-day-status">{t('results_heat_title', { n: lastHeat })}</p>
                  <div className="busy-day-actions">
                    <button type="button" className="btn-primary" onClick={broadcastHeat}>
                      {broadcasting ? t('busy_day_broadcasting') : t('busy_day_broadcast')}
                    </button>
                    <button type="button" className="btn-muted" onClick={loadLastHeat}>
                      ↻ {t('admin_results_refresh')}
                    </button>
                  </div>
                  <HeatResultsQr
                    url={resultsUrl}
                    size={180}
                    label={t('busy_day_qr_label', { n: lastHeat })}
                  />
                </>
              ) : (
                <p className="busy-day-muted">{t('admin_results_none')}</p>
              )}
            </>
          )}

          {step === 'close' && (
            <>
              <p className="busy-day-lead">{t('busy_day_close_lead')}</p>
              <ul className="busy-day-checklist">
                <li>{t('busy_day_close_1')}</li>
                <li>{t('busy_day_close_2')}</li>
                <li>{t('busy_day_close_3')}</li>
              </ul>
              <a className="btn-muted busy-day-link-btn" href={adminUrl}>{t('nav_admin')}</a>
            </>
          )}
        </div>

        <footer className="busy-day-footer">
          <button
            type="button"
            className="btn-muted"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          >
            {t('busy_day_back')}
          </button>
          {stepIdx < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn-primary"
              disabled={step === 'open' && !openReady}
              onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
            >
              {t('busy_day_next')}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={onClose}>
              {t('busy_day_done')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
