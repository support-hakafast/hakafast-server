import React, { useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import '../assets/LivePreviewFloat.css';
import { apiFetch } from '../utils/apiClient.js';
import { resolveTrackId } from '../utils/workspace.js';
import { useLiveTimingSocket } from '../hooks/useLiveTimingSocket.js';
import { useRowFlash } from '../hooks/useRowFlash.js';
import { useDraggableResizable } from '../hooks/useDraggableResizable.js';
import LiveTimingTable from './LiveTimingTable.jsx';
import { normalizeTimingColumns } from '../utils/liveTimingColumns.js';

export default function LivePreviewFloat({ onClose, heatType, trackSlug = 'kart-demo' }) {
  const { t } = useLanguage();
  const [mode, setMode] = React.useState('assignments');
  const trackId = resolveTrackId(trackSlug);

  const defaultTop = typeof window !== 'undefined' ? Math.max(80, window.innerHeight - 420) : 200;
  const { rect, onDragStart, onResizeStart } = useDraggableResizable('hf_preview_window', {
    left: 20,
    top: defaultTop,
    width: 420,
    height: 340,
  });

  const fetchFallback = useCallback(async () => {
    const res = await apiFetch(`/live-timing-data/${trackId}?mode=${mode}`, {}, trackSlug);
    if (!res.ok) return null;
    const rows = await res.json();
    const hs = await apiFetch('/api/heat-settings', {}, trackSlug);
    let timingColumns = null;
    if (hs.ok) {
      const s = await hs.json();
      timingColumns = normalizeTimingColumns(s?.timingColumns);
    }
    return { rows: Array.isArray(rows) ? rows : [], heatType, timingColumns };
  }, [trackId, mode, trackSlug, heatType]);

  const { rows, timingColumns } = useLiveTimingSocket({
    trackSlug,
    trackId,
    mode,
    enabled: true,
    fetchFallback,
  });

  const cols = normalizeTimingColumns(timingColumns);

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
      className="live-preview-float"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      <div className="live-preview-header" onPointerDown={onDragStart}>
        <strong>{t('admin_preview_title')}</strong>
        <div className="live-preview-tabs" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={mode === 'assignments' ? 'active' : ''} onClick={() => setMode('assignments')}>
            {t('live_mode_assignments')}
          </button>
          <button type="button" className={mode === 'timing' ? 'active' : ''} onClick={() => setMode('timing')}>
            {t('live_mode_timing')}
          </button>
        </div>
        <button type="button" className="live-preview-close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>×</button>
      </div>
      <div className="live-preview-body">
        <div key={mode} className="live-content-panel">
          {rows.length === 0 ? (
            <p className="live-preview-empty">{t('live_waiting')}</p>
          ) : (
            <LiveTimingTable
              t={t}
              mode={mode}
              rows={rows}
              timingColumns={cols}
              rowFlashClass={flash}
              tableClassName="live-preview-table"
            />
          )}
        </div>
        <p className="live-preview-heat">
          {heatType === 'endurance' ? t('heat_endurance') : heatType === 'sprint' ? t('heat_sprint') : t('heat_time')}
        </p>
      </div>
      <div className="live-preview-resize" onPointerDown={onResizeStart} aria-hidden />
    </div>
  );
}
