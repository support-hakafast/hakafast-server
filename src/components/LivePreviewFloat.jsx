import React, { useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import '../assets/LivePreviewFloat.css';
import { apiFetch } from '../utils/apiClient.js';
import { resolveTrackId } from '../utils/workspace.js';
import { useLiveTimingSocket } from '../hooks/useLiveTimingSocket.js';
import { useRowFlash } from '../hooks/useRowFlash.js';
import { useDraggableResizable } from '../hooks/useDraggableResizable.js';

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
    return { rows: Array.isArray(rows) ? rows : [], heatType };
  }, [trackId, mode, trackSlug, heatType]);

  const { rows } = useLiveTimingSocket({
    trackSlug,
    trackId,
    mode,
    enabled: true,
    fetchFallback,
  });

  const flashingKeys = useRowFlash(
    rows,
    (row) => `${row.kart_number || row.driver_name}-${row.position || ''}`,
    ['last_lap_time', 'best_lap_time', 'lap_count', 'kart_number'],
  );

  const flash = (row, i) => {
    const key = `${row.kart_number || row.driver_name}-${row.position || i}`;
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
          ) : mode === 'assignments' ? (
            <table className="live-preview-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('driver')}</th>
                  <th>{t('kart')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.driver_name}-${i}`} className={flash(r, i)}>
                    <td>{r.position || i + 1}</td>
                    <td>{r.driver_name}</td>
                    <td>{r.kart_number ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="live-preview-table">
              <thead>
                <tr>
                  <th>{t('pos')}</th>
                  <th>{t('kart')}</th>
                  <th>{t('driver')}</th>
                  <th>{t('best_lap')}</th>
                  <th>{t('laps')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.kart_number}-${i}`} className={flash(r, i)}>
                    <td>{i + 1}</td>
                    <td>{r.kart_number}</td>
                    <td>{r.driver_name || t('anonymous')}</td>
                    <td>{r.best_lap_time || '—'}</td>
                    <td>{r.lap_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
