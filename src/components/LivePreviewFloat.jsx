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
import { normalizeTimingColumns, normalizeTimingColumnOrder } from '../utils/liveTimingColumns.js';

export default function LivePreviewFloat({ onClose, heatType, trackSlug = 'kart-demo' }) {
  const { t } = useLanguage();
  const [mode, setMode] = React.useState('assignments');
  const trackId = resolveTrackId(trackSlug);

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

  const cols = normalizeTimingColumns(timingColumns);
  const columnOrder = normalizeTimingColumnOrder(timingColumnOrder);

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
      className={`live-preview-float${compact ? ' live-preview-float--compact' : ''}`}
      data-tour="preview"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
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
        </div>
        <button type="button" className="live-preview-close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>×</button>
      </div>
      <div className="live-preview-body live-display theme-dark">
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
      </div>
      <div className="live-preview-resize" onPointerDown={onResizeStart} aria-hidden />
    </div>
  );
}
