import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import '../assets/LiveTiming.css';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import HakafastLogo from './HakafastLogo.jsx';
import LiveTimingTable from './LiveTimingTable.jsx';
import LiveAssignmentsBoard from './LiveAssignmentsBoard.jsx';
import LiveLapStats from './LiveLapStats.jsx';
import { apiFetch } from '../utils/apiClient.js';
import {
  usesIsolatedWorkspace,
  getWorkspaceLabel,
  resolveTrackId,
} from '../utils/workspace.js';
import { useLiveTimingSocket } from '../hooks/useLiveTimingSocket.js';
import { useRowFlash } from '../hooks/useRowFlash.js';
import { useLiveTheme } from '../hooks/useLiveTheme.js';
import { normalizeTimingColumns, normalizeTimingColumnOrder } from '../utils/liveTimingColumns.js';
import { formatHeatClock, getHeatClockClassName } from '../utils/adminHelpers.js';
import { useLiveLayoutTier } from '../hooks/useLiveWideLayout.js';
import { useTickingHeatClock } from '../hooks/useTickingHeatClock.js';

const HEAT_LABEL_KEYS = { time: 'heat_time', endurance: 'heat_endurance', sprint: 'heat_sprint' };

const LiveTiming = () => {
  const { track } = useParams();
  const { t } = useLanguage();
  const [mode, setMode] = useState('timing');
  const prevModeRef = useRef('timing');
  const { theme, isDark, toggle } = useLiveTheme();

  const switchMode = (next) => {
    prevModeRef.current = mode;
    setMode(next);
  };

  const transitionClass = mode === 'assignments' && prevModeRef.current === 'timing'
    ? 'live-transition-to-assignments'
    : mode === 'timing' && prevModeRef.current === 'assignments'
      ? 'live-transition-to-timing'
      : '';

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
    let timingColumnOrder = null;
    let hasPreparedHeat = false;
    const hs = await apiFetch('/api/heat-settings', {}, isolated ? trackSlug : null);
    if (hs.ok) {
      const s = await hs.json();
      heat = s?.type || 'time';
      timingColumns = normalizeTimingColumns(s?.timingColumns);
      timingColumnOrder = normalizeTimingColumnOrder(s?.timingColumnOrder);
    }
    let heatNumber = null;
    let topLaps = null;
    let heatClock = null;
    const session = await apiFetch('/api/admin/session-state', {}, isolated ? trackSlug : null);
    if (session.ok) {
      const s = await session.json();
      hasPreparedHeat = Boolean(s.hasPreparedHeat);
      heatNumber = s.heatNumber ?? null;
      topLaps = s.topLaps ?? null;
      heatClock = s.heatClock ?? null;
    }
    let displayedHeat = null;
    const dr = await apiFetch('/api/display-results', {}, isolated ? trackSlug : null);
    if (dr.ok) {
      const d = await dr.json();
      displayedHeat = d.displayedHeat || null;
    }
    return {
      rows: Array.isArray(rows) ? rows : [],
      heatType: heat,
      timingColumns,
      timingColumnOrder,
      hasPreparedHeat,
      heatNumber,
      topLaps,
      heatClock,
      displayedHeat,
    };
  }, [trackId, mode, trackSlug, isolated]);

  const {
    rows: rowsData,
    heatType,
    timingColumns,
    timingColumnOrder,
    hasPreparedHeat,
    heatNumber,
    topLaps,
    heatClock,
    displayedHeat,
  } = useLiveTimingSocket({
    trackSlug: isolated ? trackSlug : (track || 'default'),
    trackId,
    mode,
    enabled: true,
    fetchFallback,
  });

  const sessionLabel = t(HEAT_LABEL_KEYS[heatType] || 'session_practice');
  const clockPhaseLabels = {
    lastLap: t('live_race_last_lap'),
    checkered: '🏁',
    formation: t('live_race_formation'),
  };
  const cols = normalizeTimingColumns(timingColumns);
  const columnOrder = normalizeTimingColumnOrder(timingColumnOrder);

  const flashingKeys = useRowFlash(
    rowsData,
    (row) => `${mode}-${row.kart_number || row.driver_name}`,
    mode === 'timing'
      ? ['last_lap_time', 'best_lap_time', 'lap_count']
      : ['kart_number', 'driver_name', 'lap_count'],
  );

  const displayHeatClock = useTickingHeatClock(heatClock);

  const layoutTier = useLiveLayoutTier();
  const isCompact = layoutTier === 'compact';
  const isWide = layoutTier === 'wide' || layoutTier === 'ultra';
  const layoutClass = [
    layoutTier === 'ultra' ? ' is-wide is-ultra' : (isWide ? ' is-wide' : ''),
    isCompact ? ' is-compact' : '',
  ].join('');
  const clockNotStartedLabel = isCompact ? t('live_clock_not_started_short') : t('admin_heat_not_started');
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    setStatsOpen(isWide);
  }, [isWide]);

  const rowFlashClass = (row, index) => {
    const key = `${mode}-${row.kart_number || row.driver_name}`;
    return flashingKeys.has(key) ? 'live-row-flash' : '';
  };

  const displayRows = displayedHeat
    ? [...(displayedHeat.results || [])].sort((a, b) => {
        const at = a.best_lap_time || '99:99.999';
        const bt = b.best_lap_time || '99:99.999';
        if (displayedHeat.heat_type === 'sprint') {
          const ld = (b.lap_count || 0) - (a.lap_count || 0);
          if (ld !== 0) return ld;
        }
        return at.localeCompare(bt);
      })
    : null;

  return (
    <div className={`live-timing theme-${theme}`}>
      <header className={`live-timing-header${layoutClass}`}>
        {isCompact ? (
          <>
            <div className="live-header-compact-top">
              <Link to="/" className="live-header-home" aria-label={t('nav_home')}>
                ←
              </Link>
              <div className="live-header-compact-meta">
                <span className="live-header-compact-title">{t(titleKey)}</span>
                <span className="live-session-badge">{sessionLabel}</span>
                {heatNumber ? (
                  <span className="live-heat-number-badge">{t('live_heat_number', { n: heatNumber })}</span>
                ) : null}
                {hasPreparedHeat && mode === 'assignments' && (
                  <span className="live-preview-badge">{t('live_next_heat_ready')}</span>
                )}
              </div>
              <div className="live-header-compact-util">
                <button type="button" className="live-theme-toggle" onClick={toggle} aria-label={t('live_theme_toggle')}>
                  {isDark ? '☀️' : '🌙'}
                </button>
                <LanguageSwitcher compact className="live-lang-compact" />
              </div>
            </div>
            <div className="live-header-compact-bottom">
              {displayHeatClock ? (
                <div className={`live-race-clock live-race-clock-compact${getHeatClockClassName(displayHeatClock)}`} aria-live="polite">
                  {formatHeatClock(displayHeatClock, clockNotStartedLabel, '00:00', clockPhaseLabels)}
                </div>
              ) : null}
              <div className="live-mode-tabs live-mode-tabs-compact">
                <button type="button" className={mode === 'assignments' ? 'active' : ''} onClick={() => switchMode('assignments')}>
                  {t('live_mode_assignments')}
                </button>
                <button type="button" className={mode === 'timing' ? 'active' : ''} onClick={() => switchMode('timing')}>
                  {t('live_mode_timing')}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="live-header-row live-header-row-main">
              <h1>{t(titleKey)}</h1>
              <div className="live-header-badges">
                <span className="live-session-badge">{sessionLabel}</span>
                {isolated && (
                  <span className="live-demo-badge">{t('demo_workspace_badge', { id: getWorkspaceLabel(trackSlug) })}</span>
                )}
                <span className="live-ws-badge">{t('live_ws_realtime')}</span>
                {heatNumber ? (
                  <span className="live-heat-number-badge">{t('live_heat_number', { n: heatNumber })}</span>
                ) : null}
                {hasPreparedHeat && mode === 'assignments' && (
                  <span className="live-preview-badge">{t('live_next_heat_ready')}</span>
                )}
              </div>
            </div>
            <div className="live-header-row live-header-row-actions">
              {displayHeatClock ? (
                <div className={`live-race-clock${getHeatClockClassName(displayHeatClock)}`} aria-live="polite">
                  {formatHeatClock(displayHeatClock, t('admin_heat_not_started'), '00:00', clockPhaseLabels)}
                </div>
              ) : null}
              <div className="live-header-actions">
                <div className="live-mode-tabs">
                  <button type="button" className={mode === 'assignments' ? 'active' : ''} onClick={() => switchMode('assignments')}>
                    {t('live_mode_assignments')}
                  </button>
                  <button type="button" className={mode === 'timing' ? 'active' : ''} onClick={() => switchMode('timing')}>
                    {t('live_mode_timing')}
                  </button>
                </div>
                <button type="button" className="live-theme-toggle" onClick={toggle} aria-label={t('live_theme_toggle')}>
                  {isDark ? '☀️' : '🌙'}
                </button>
                <HakafastLogo to="/" className="live-header-logo" />
                <LanguageSwitcher />
              </div>
            </div>
          </>
        )}
      </header>

      <div className={`live-display theme-${theme}`}>
      {rowsData.length === 0 ? (
        <p className="live-empty">{t('live_waiting')}</p>
      ) : (
        <div
          key={mode}
          className={`live-content-panel live-view-${mode} ${transitionClass}`.trim()}
        >
          {mode === 'assignments' ? (
            <LiveAssignmentsBoard
              t={t}
              rows={rowsData}
              heatType={heatType}
              rowFlashClass={rowFlashClass}
              isNextHeat={hasPreparedHeat}
            />
          ) : (
            <div className={`live-timing-layout${layoutClass}`}>
              <div className="live-timing-primary">
                <div className="live-timing-table-wrap">
                  <LiveTimingTable
                    t={t}
                    mode="timing"
                    rows={rowsData}
                    timingColumns={cols}
                    timingColumnOrder={columnOrder}
                    heatType={heatType}
                    rowFlashClass={rowFlashClass}
                    tableClassName="live-timing-table live-timing-dense"
                  />
                </div>
                {!isWide && (
                  <div className={`live-lap-stats-collapsible${statsOpen ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="live-lap-stats-toggle"
                      aria-expanded={statsOpen}
                      onClick={() => setStatsOpen((open) => !open)}
                    >
                      <span>{t('live_stats_title')}</span>
                      <span className="live-lap-stats-chevron" aria-hidden>{statsOpen ? '▲' : '▼'}</span>
                    </button>
                    {statsOpen && (
                      <LiveLapStats
                        t={t}
                        topLaps={topLaps}
                        heatNumber={heatNumber}
                        embedded
                      />
                    )}
                  </div>
                )}
              </div>
              {isWide && (
                <LiveLapStats t={t} topLaps={topLaps} heatNumber={heatNumber} />
              )}
            </div>
          )}
        </div>
      )}
      </div>

      {displayedHeat && displayRows && (
        <div className="live-results-overlay">
          <div className="live-results-panel">
            <div className="live-results-header">
              <span className="live-results-title">
                {t('live_results_heat', { n: displayedHeat.heat_number }) || `מקצה #${displayedHeat.heat_number}`}
              </span>
              <span className="live-results-type">{displayedHeat.heat_type}</span>
            </div>
            <table className="live-results-table">
              <thead>
                <tr>
                  <th className="live-results-col-pos">{t('pos') || '#'}</th>
                  <th className="live-results-col-kart">{t('kart') || 'קארט'}</th>
                  <th className="live-results-col-driver">{t('driver') || 'נהג'}</th>
                  <th className="live-results-col-best">{t('best_lap') || 'שיא'}</th>
                  <th className="live-results-col-laps">{t('laps') || 'הקפות'}</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r, i) => (
                  <tr key={r.kart_number || i} className={i === 0 ? 'live-results-row-first' : ''}>
                    <td className="live-results-col-pos">{i + 1}</td>
                    <td className="live-results-col-kart">{r.kart_number || '—'}</td>
                    <td className="live-results-col-driver">{r.driver_name || t('anonymous') || '—'}</td>
                    <td className="live-results-col-best">{r.best_lap_time || '—'}</td>
                    <td className="live-results-col-laps">{r.lap_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveTiming;
