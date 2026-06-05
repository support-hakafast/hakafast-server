import React, { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import '../assets/LiveTiming.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LiveTimingTable from './LiveTimingTable.jsx';
import { apiFetch } from '../utils/apiClient.js';
import {
  usesIsolatedWorkspace,
  getWorkspaceLabel,
  resolveTrackId,
} from '../utils/workspace.js';
import { useLiveTimingSocket } from '../hooks/useLiveTimingSocket.js';
import { useRowFlash } from '../hooks/useRowFlash.js';
import { useLiveTheme } from '../hooks/useLiveTheme.js';
import { normalizeTimingColumns } from '../utils/liveTimingColumns.js';

const HEAT_LABEL_KEYS = { time: 'heat_time', endurance: 'heat_endurance', sprint: 'heat_sprint' };

const LiveTiming = () => {
  const { track } = useParams();
  const { t } = useLanguage();
  const [mode, setMode] = useState('timing');
  const { theme, isDark, toggle } = useLiveTheme();

  const trackSlug = track || 'default';
  const trackId = resolveTrackId(track);
  const titleKey = track === 'kart-demo' ? 'live_title_demo' : 'live_title_haifa';
  const isolated = usesIsolatedWorkspace(track);

  const fetchFallback = useCallback(async () => {
    const res = await apiFetch(
      `/live-timing-data/${trackId}?mode=${mode}`,
      {},
      isolated ? trackSlug : null,
    );
    if (!res.ok) return null;
    const rows = await res.json();
    let heat = 'time';
    let timingColumns = null;
    const hs = await apiFetch('/api/heat-settings', {}, isolated ? trackSlug : null);
    if (hs.ok) {
      const s = await hs.json();
      heat = s?.type || 'time';
      timingColumns = normalizeTimingColumns(s?.timingColumns);
    }
    return { rows: Array.isArray(rows) ? rows : [], heatType: heat, timingColumns };
  }, [trackId, mode, trackSlug, isolated]);

  const { rows: rowsData, heatType, timingColumns } = useLiveTimingSocket({
    trackSlug: isolated ? trackSlug : (track || 'default'),
    trackId,
    mode,
    enabled: true,
    fetchFallback,
  });

  const sessionLabel = t(HEAT_LABEL_KEYS[heatType] || 'session_practice');
  const cols = normalizeTimingColumns(timingColumns);

  const flashingKeys = useRowFlash(
    rowsData,
    (row) => `${mode}-${row.position ?? ''}-${row.kart_number || row.driver_name}`,
    mode === 'timing'
      ? ['last_lap_time', 'best_lap_time', 'lap_count', 'kart_number', 'avg_lap_time', 'second_best_lap_time']
      : ['kart_number', 'driver_name'],
  );

  const rowFlashClass = (row, index) => {
    const key = `${mode}-${row.position ?? ''}-${row.kart_number || row.driver_name}`;
    return flashingKeys.has(key) ? 'live-row-flash' : '';
  };

  return (
    <div className={`live-timing theme-${theme}`}>
      <header className="live-timing-header">
        <div>
          <h1>{t(titleKey)}</h1>
          <span className="live-session-badge">{sessionLabel}</span>
          {isolated && (
            <span className="live-demo-badge">{t('demo_workspace_badge', { id: getWorkspaceLabel(trackSlug) })}</span>
          )}
          <span className="live-ws-badge">{t('live_ws_realtime')}</span>
        </div>
        <div className="live-header-actions">
          <div className="live-mode-tabs">
            <button type="button" className={mode === 'assignments' ? 'active' : ''} onClick={() => setMode('assignments')}>
              {t('live_mode_assignments')}
            </button>
            <button type="button" className={mode === 'timing' ? 'active' : ''} onClick={() => setMode('timing')}>
              {t('live_mode_timing')}
            </button>
          </div>
          <button type="button" className="live-theme-toggle" onClick={toggle} aria-label={t('live_theme_toggle')}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <HakafastLogo to="/" className="live-header-logo" />
          <LanguageSwitcher />
        </div>
      </header>

      {rowsData.length === 0 ? (
        <p className="live-empty">{t('live_waiting')}</p>
      ) : (
        <div key={mode} className="live-content-panel live-timing-table-wrap">
          <LiveTimingTable
            t={t}
            mode={mode}
            rows={rowsData}
            timingColumns={cols}
            rowFlashClass={rowFlashClass}
          />
        </div>
      )}
    </div>
  );
};

export default LiveTiming;
