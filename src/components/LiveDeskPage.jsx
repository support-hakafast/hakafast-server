import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import '../assets/LiveTiming.css';
import '../assets/LivePreviewFloat.css';
import '../assets/SalesPages.css';
import { apiFetch } from '../utils/apiClient.js';
import { resolveTrackId } from '../utils/workspace.js';
import { useLiveTimingSocket } from '../hooks/useLiveTimingSocket.js';
import { useRowFlash } from '../hooks/useRowFlash.js';
import LiveTimingTable from './LiveTimingTable.jsx';
import LiveAssignmentsBoard from './LiveAssignmentsBoard.jsx';
import { normalizeTimingColumns, normalizeTimingColumnOrder } from '../utils/liveTimingColumns.js';

export default function LiveDeskPage() {
  const { track } = useParams();
  const [search] = useSearchParams();
  const { t } = useLanguage();
  const trackSlug = track || 'kart-demo';
  const trackId = resolveTrackId(trackSlug);
  const heatType = search.get('heatType') || 'time';
  const [mode, setMode] = useState('assignments');

  useEffect(() => {
    document.title = t('admin_preview_title');
    document.body.classList.add('live-desk-body');
    return () => document.body.classList.remove('live-desk-body');
  }, [t]);

  const fetchFallback = useCallback(async () => {
    const res = await apiFetch(`/live-timing-data/${trackId}?mode=${mode}`, {}, trackSlug);
    if (!res.ok) return null;
    const rows = await res.json();
    const hs = await apiFetch('/api/heat-settings', {}, trackSlug);
    let timingColumns = null;
    let timingColumnOrder = null;
    let resolvedHeatType = heatType;
    if (hs.ok) {
      const s = await hs.json();
      resolvedHeatType = s?.type || heatType;
      timingColumns = normalizeTimingColumns(s?.timingColumns);
      timingColumnOrder = normalizeTimingColumnOrder(s?.timingColumnOrder);
    }
    return {
      rows: Array.isArray(rows) ? rows : [],
      heatType: resolvedHeatType,
      timingColumns,
      timingColumnOrder,
    };
  }, [trackId, mode, trackSlug, heatType]);

  const { rows, heatType: liveHeatType, timingColumns, timingColumnOrder } = useLiveTimingSocket({
    trackSlug,
    trackId,
    mode,
    enabled: true,
    fetchFallback,
  });

  const effectiveHeatType = liveHeatType || heatType;
  const cols = normalizeTimingColumns(timingColumns);
  const columnOrder = normalizeTimingColumnOrder(timingColumnOrder);

  const flashingKeys = useRowFlash(
    rows,
    (row) => `${mode}-${row.position ?? ''}-${row.kart_number || row.driver_name}`,
    mode === 'timing'
      ? ['last_lap_time', 'best_lap_time', 'lap_count', 'kart_number']
      : ['kart_number', 'driver_name'],
  );

  const flash = useCallback((row, i) => {
    const key = `${mode}-${row.position ?? ''}-${row.kart_number || row.driver_name}`;
    return flashingKeys.has(key) ? 'live-row-flash' : '';
  }, [mode, flashingKeys]);

  const heatLabel = useMemo(() => {
    if (effectiveHeatType === 'endurance') return t('heat_endurance');
    if (effectiveHeatType === 'sprint') return t('heat_sprint');
    return t('heat_time');
  }, [effectiveHeatType, t]);

  const closeWindow = () => {
    window.close();
  };

  return (
    <div className="live-desk-page">
      <header className="live-desk-header">
        <div className="live-desk-header-start">
          <strong className="live-desk-title">{t('admin_preview_title')}</strong>
          <span className="live-desk-track">{trackSlug}</span>
          <span className="live-desk-heat-badge">{heatLabel}</span>
        </div>
        <div className="live-preview-tabs live-desk-tabs">
          <button type="button" className={mode === 'assignments' ? 'active' : ''} onClick={() => setMode('assignments')}>
            {t('live_mode_assignments')}
          </button>
          <button type="button" className={mode === 'timing' ? 'active' : ''} onClick={() => setMode('timing')}>
            {t('live_mode_timing')}
          </button>
        </div>
        <button type="button" className="live-desk-close" onClick={closeWindow} title={t('live_desk_close')}>
          ×
        </button>
      </header>
      <main className="live-desk-body-inner live-display theme-dark">
        {rows.length === 0 ? (
          <div className="live-desk-empty">
            <span className="live-desk-empty-icon" aria-hidden>⏱</span>
            <p>{t('live_waiting')}</p>
          </div>
        ) : mode === 'assignments' ? (
          <LiveAssignmentsBoard
            t={t}
            rows={rows}
            heatType={effectiveHeatType}
            rowFlashClass={flash}
            isNextHeat={rows.some((r) => r.status === 'prepared')}
          />
        ) : (
          <LiveTimingTable
            t={t}
            mode="timing"
            rows={rows}
            timingColumns={cols}
            timingColumnOrder={columnOrder}
            heatType={effectiveHeatType}
            rowFlashClass={flash}
            tableClassName="live-timing-table live-timing-dense live-desk-table"
          />
        )}
      </main>
    </div>
  );
}
