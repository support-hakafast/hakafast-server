import React, { useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import '../assets/LiveTiming.css';
import '../assets/LivePreviewFloat.css';
import { apiFetch } from '../utils/apiClient.js';
import { resolveTrackId } from '../utils/workspace.js';
import { useLiveTimingSocket } from '../hooks/useLiveTimingSocket.js';
import { useRowFlash } from '../hooks/useRowFlash.js';
import { useDraggableResizable, getPreviewWindowDefaults } from '../hooks/useDraggableResizable.js';
import LiveTimingTable from './LiveTimingTable.jsx';
import LiveAssignmentsBoard from './LiveAssignmentsBoard.jsx';
import TimingColumnsPicker from './TimingColumnsPicker.jsx';
import { normalizeTimingColumns, normalizeTimingColumnOrder } from '../utils/liveTimingColumns.js';

export default function LivePreviewFloat({
  onClose,
  heatType,
  trackSlug = 'kart-demo',
  timingColumns: timingColumnsProp,
  onToggleTimingColumn,
  tourElevated = false,
  darkMode = false,
}) {
  const { t } = useLanguage();
  const [mode, setMode] = React.useState('assignments');
  const [showColumnPicker, setShowColumnPicker] = React.useState(false);
  const [historyList, setHistoryList] = React.useState(null);
  const [activeDisplayHeat, setActiveDisplayHeat] = React.useState(null);
  const trackId = resolveTrackId(trackSlug);

  const loadHistory = React.useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await apiFetch('/api/results/list?limit=50', {}, trackSlug);
    if (!res.ok) return;
    const data = await res.json();
    const todayHeats = (data.heats || []).filter((h) => {
      if (!h.created_at) return true;
      return String(h.created_at).slice(0, 10) === today;
    });
    setHistoryList(todayHeats);
  }, [trackSlug]);

  const broadcastHeat = React.useCallback(async (heatNumber) => {
    await apiFetch('/api/display-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heatNumber }),
    }, trackSlug);
    setActiveDisplayHeat(heatNumber);
  }, [trackSlug]);

  const clearBroadcast = React.useCallback(async () => {
    await apiFetch('/api/display-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heatNumber: null }),
    }, trackSlug);
    setActiveDisplayHeat(null);
  }, [trackSlug]);

  React.useEffect(() => {
    if (mode === 'history' && historyList === null) loadHistory();
  }, [mode, historyList, loadHistory]);

  const [compact, setCompact] = React.useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768,
  );

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const { rect, onDragStart, onResizeStart } = useDraggableResizable('hf_preview_window', getPreviewWindowDefaults());

  const fetchFallback = useCallback(async () => {
    const res = await apiFetch(`/live-timing-data/${trackId}?mode=${mode}`, {}, trackSlug);
    if (!res.ok) return null;
    const rows = await res.json();
    const hs = await apiFetch('/api/heat-settings', {}, trackSlug);
    let timingColumns = null;
    let timingColumnOrder = null;
    if (hs.ok) {
      const s = await hs.json();
      timingColumns = normalizeTimingColumns(s?.timingColumns);
      timingColumnOrder = normalizeTimingColumnOrder(s?.timingColumnOrder);
    }
    return {
      rows: Array.isArray(rows) ? rows : [],
      heatType,
      timingColumns,
      timingColumnOrder,
    };
  }, [trackId, mode, trackSlug, heatType]);

  const { rows, timingColumns, timingColumnOrder } = useLiveTimingSocket({
    trackSlug,
    trackId,
    mode,
    enabled: true,
    fetchFallback,
  });

  const cols = normalizeTimingColumns(timingColumnsProp ?? timingColumns);
  const columnOrder = normalizeTimingColumnOrder(timingColumnOrder);
  const canPickColumns = mode === 'timing' && timingColumnsProp && onToggleTimingColumn;

  const flashingKeys = useRowFlash(
    rows,
    (row) => `${mode}-${row.position ?? ''}-${row.kart_number || row.driver_name}`,
    mode === 'timing'
      ? ['last_lap_time', 'best_lap_time', 'lap_count', 'kart_number']
      : ['kart_number', 'driver_name'],
  );

  const flash = (row, i) => {
    const key = `${mode}-${row.position ?? ''}-${row.kart_number || row.driver_name}`;
    return flashingKeys.has(key) ? 'live-row-flash' : '';
  };

  return (
    <div
      className={[
        'live-preview-float',
        darkMode ? 'live-preview-float--dark' : 'live-preview-float--light',
        compact ? 'live-preview-float--compact' : '',
        tourElevated ? 'live-preview-float--tour' : '',
      ].filter(Boolean).join(' ')}
      data-tour="preview"
      style={rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined}
    >
      <div className="live-preview-header" onPointerDown={onDragStart}>
        <strong className="live-preview-title">{t('admin_preview_title')}</strong>
        <div className="live-preview-tabs" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={mode === 'assignments' ? 'active' : ''} onClick={() => setMode('assignments')}>
            {t('live_mode_assignments')}
          </button>
          <button
            type="button"
            className={mode === 'timing' ? 'active' : ''}
            data-tour="preview-timing-tab"
            onClick={() => setMode('timing')}
          >
            {t('live_mode_timing')}
          </button>
          <button
            type="button"
            className={`${mode === 'history' ? 'active' : ''}${activeDisplayHeat ? ' live-preview-tab-broadcasting' : ''}`}
            onClick={() => setMode('history')}
            title={t('admin_results_history') || 'היסטוריה'}
          >
            🏁
          </button>
          {canPickColumns && (
            <button
              type="button"
              className={`live-preview-cols-btn${showColumnPicker ? ' active' : ''}`}
              onClick={() => setShowColumnPicker((v) => !v)}
              title={t('admin_timing_columns')}
            >
              ▦
            </button>
          )}
        </div>
        <button type="button" className="live-preview-close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>×</button>
      </div>
      <div className={`live-preview-body live-display${darkMode ? ' theme-dark' : ' theme-light'}`}>
        {mode === 'history' ? (
          <div className="live-preview-history">
            {activeDisplayHeat && (
              <div className="live-preview-history-active">
                <span>{t('admin_results_showing', { n: activeDisplayHeat }) || `מוצג: מקצה #${activeDisplayHeat}`}</span>
                <button type="button" className="live-preview-history-clear" onClick={clearBroadcast}>
                  {t('admin_results_hide') || 'הסתר'}
                </button>
              </div>
            )}
            {historyList === null ? (
              <p className="live-preview-history-empty">{t('results_loading') || '...'}</p>
            ) : historyList.length === 0 ? (
              <p className="live-preview-history-empty">{t('admin_results_none') || 'אין מקצים להיום'}</p>
            ) : (
              <ul className="live-preview-history-list">
                {historyList.map((h) => (
                  <li key={h.heat_number} className={activeDisplayHeat === h.heat_number ? 'is-active' : ''}>
                    <button
                      type="button"
                      className="live-preview-history-item"
                      onClick={() => broadcastHeat(h.heat_number)}
                    >
                      <span className="live-preview-history-num">#{h.heat_number}</span>
                      <span className="live-preview-history-type">{h.heat_type}</span>
                      <span className="live-preview-history-count">{h.driver_count} נהגים</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="live-preview-history-refresh" onClick={loadHistory}>
              ↻ {t('admin_results_refresh') || 'רענן'}
            </button>
          </div>
        ) : (
          <>
            {canPickColumns && showColumnPicker && (
              <div className="live-preview-columns-picker">
                <TimingColumnsPicker
                  t={t}
                  compact
                  heatType={heatType}
                  timingColumns={timingColumnsProp}
                  onToggleColumn={onToggleTimingColumn}
                />
              </div>
            )}
            <div key={mode} className="live-content-panel">
              {rows.length === 0 ? (
                <p className="live-preview-empty">{t('live_waiting')}</p>
              ) : (
                mode === 'assignments' ? (
                  <LiveAssignmentsBoard
                    t={t}
                    rows={rows}
                    heatType={heatType}
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
                    heatType={heatType}
                    rowFlashClass={flash}
                    tableClassName="live-timing-table live-timing-dense"
                  />
                )
              )}
            </div>
            <p className="live-preview-heat">
              {heatType === 'endurance' ? t('heat_endurance') : heatType === 'sprint' ? t('heat_sprint') : t('heat_time')}
            </p>
          </>
        )}
      </div>
      <div className="live-preview-resize" onPointerDown={onResizeStart} aria-hidden />
    </div>
  );
}
