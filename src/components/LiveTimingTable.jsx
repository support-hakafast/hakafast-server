import React, { useMemo } from 'react';
import {
  OPTIONAL_TIMING_COLUMNS,
  formatLapCell,
  gapToLeader,
  lapToSeconds,
} from '../utils/liveTimingColumns.js';

export default function LiveTimingTable({
  t,
  mode,
  rows,
  timingColumns,
  rowFlashClass,
  tableClassName = 'live-timing-table',
}) {
  const leaderBestSec = useMemo(() => {
    if (mode !== 'timing' || !rows.length) return Infinity;
    return lapToSeconds(rows[0]?.best_lap_time);
  }, [mode, rows]);

  if (mode === 'assignments') {
    return (
      <table className={tableClassName}>
        <thead>
          <tr>
            <th>#</th>
            <th>{t('kart')}</th>
            <th>{t('driver')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`assign-${row.position ?? index}-${row.driver_name}`} className={rowFlashClass(row, index)}>
              <td className="live-pos">{row.position ?? index + 1}</td>
              <td>{row.kart_number ?? '—'}</td>
              <td style={{ textAlign: 'start' }}>{row.driver_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const optionalCols = OPTIONAL_TIMING_COLUMNS.filter((col) => timingColumns?.[col.id]);

  return (
    <table className={tableClassName}>
      <thead>
        <tr>
          <th>{t('pos')}</th>
          <th>{t('kart')}</th>
          <th>{t('driver')}</th>
          <th className="live-col-highlight">{t('best_lap')}</th>
          <th className="live-col-highlight">{t('last_lap')}</th>
          {optionalCols.map((col) => (
            <th key={col.id}>{t(col.labelKey)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const isLeader = index === 0 && row.best_lap_time;
          return (
            <tr key={`timing-${row.kart_number}-${index}`} className={rowFlashClass(row, index)}>
              <td className="live-pos">{index + 1}</td>
              <td>{row.kart_number}</td>
              <td style={{ textAlign: 'start' }}>
                {isLeader && '👑 '}
                {row.driver_name || t('anonymous')}
              </td>
              <td className={`live-col-highlight${isLeader ? ' live-best' : ''}`}>
                {formatLapCell(row.best_lap_time)}
              </td>
              <td className="live-col-highlight live-last-lap">
                {formatLapCell(row.last_lap_time)}
              </td>
              {optionalCols.map((col) => {
                if (col.id === 'laps') {
                  return <td key={col.id}>{row.lap_count ?? row.total_laps ?? 0}</td>;
                }
                if (col.id === 'second_best') {
                  return <td key={col.id}>{formatLapCell(row.second_best_lap_time)}</td>;
                }
                if (col.id === 'avg_lap') {
                  return <td key={col.id}>{formatLapCell(row.avg_lap_time)}</td>;
                }
                if (col.id === 'level') {
                  return <td key={col.id}>{row.driver_level ? t(`level_${row.driver_level.toLowerCase()}`) : '—'}</td>;
                }
                if (col.id === 'gap') {
                  return (
                    <td key={col.id}>
                      {gapToLeader(row, leaderBestSec, lapToSeconds)}
                    </td>
                  );
                }
                return <td key={col.id}>—</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
