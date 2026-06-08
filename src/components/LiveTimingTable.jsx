import React, { useMemo } from 'react';
import {
  getOrderedOptionalColumns,
  formatLapCell,
  gapToLeader,
  lapToSeconds,
} from '../utils/liveTimingColumns.js';

function isSessionFastestLap(row) {
  if (!row?.last_lap_time) return false;
  return Boolean(row.is_session_fastest);
}

function hasLeaderTiming(row, heatType) {
  if (heatType === 'time') return Boolean(row.best_lap_time);
  return (row.lap_count || 0) > 0;
}

function renderOptionalCell(col, row, leader, heatType, t) {
  const cellClass = `live-col-optional live-col-${col.group}`;
  if (col.id === 'laps') {
    return <td key={col.id} className={cellClass}>{row.lap_count ?? row.total_laps ?? 0}</td>;
  }
  if (col.id === 'second_best') {
    return <td key={col.id} className={cellClass}>{formatLapCell(row.second_best_lap_time)}</td>;
  }
  if (col.id === 'avg_lap') {
    return <td key={col.id} className={cellClass}>{formatLapCell(row.avg_lap_time)}</td>;
  }
  if (col.id === 'level') {
    return (
      <td key={col.id} className={cellClass}>
        {row.driver_level ? t(`level_${String(row.driver_level).toLowerCase()}`) : '—'}
      </td>
    );
  }
  if (col.id === 'gap') {
    return (
      <td key={col.id} className={cellClass}>
        {gapToLeader(row, leader, heatType, lapToSeconds)}
      </td>
    );
  }
  if (col.id === 'pit_visits') {
    return <td key={col.id} className={cellClass}>{row.pit_visits ?? 0}</td>;
  }
  if (col.id === 'pit_time') {
    return (
      <td key={col.id} className={cellClass}>
        {row.in_pits
          ? (row.pit_duration_display || '0:00')
          : (row.total_pit_time_display || '0:00')}
      </td>
    );
  }
  if (col.id === 'penalty') {
    return <td key={col.id} className={`${cellClass} live-penalty-cell`}>{row.penalty_display || '—'}</td>;
  }
  if (col.id === 'stint') {
    const stint = row.current_stint;
    if (!stint) return <td key={col.id} className={cellClass}>—</td>;
    return (
      <td key={col.id} className={cellClass}>
        {stint.duration_display || '0:00'}
        {stint.lap_count > 0 ? ` · ${stint.lap_count}${t('laps_short')}` : ''}
      </td>
    );
  }
  return <td key={col.id} className={cellClass}>—</td>;
}

export default function LiveTimingTable({
  t,
  mode,
  rows,
  timingColumns,
  timingColumnOrder,
  heatType = 'time',
  rowFlashClass,
  tableClassName = 'live-timing-table',
}) {
  const isEndurance = heatType === 'endurance';
  const leader = useMemo(() => (mode === 'timing' && rows.length ? rows[0] : null), [mode, rows]);
  const optionalCols = useMemo(
    () => getOrderedOptionalColumns(timingColumns, timingColumnOrder),
    [timingColumns, timingColumnOrder],
  );

  return (
    <table className={tableClassName}>
      <thead>
        <tr>
          <th className="live-col-pos">{t('pos')}</th>
          {isEndurance && <th className="live-col-team">{t('team')}</th>}
          <th className="live-col-kart">{t('kart')}</th>
          <th className="live-col-driver">{isEndurance ? t('live_col_stint_driver') : t('driver')}</th>
          {isEndurance && <th className="live-col-laps-fixed">{t('laps')}</th>}
          <th className="live-col-lap">{t('best_lap')}</th>
          <th className="live-col-lap">{t('last_lap')}</th>
          {optionalCols.map((col) => (
            <th key={col.id} className={`live-col-optional live-col-${col.group}`}>{t(col.labelKey)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const isLeader = index === 0 && hasLeaderTiming(row, heatType);
          const sessionFastestLap = isSessionFastestLap(row);
          const driverLabel = isEndurance
            ? (row.active_driver || row.current_stint?.driver_name || row.driver_name || t('anonymous'))
            : (row.driver_name || t('anonymous'));
          return (
            <tr
              key={`timing-${row.kart_number}-${index}`}
              className={`${rowFlashClass(row, index)}${isLeader ? ' live-leader-row' : ''}${row.in_pits ? ' live-in-pits-row' : ''}`}
            >
              <td className="live-pos live-col-pos">{index + 1}</td>
              {isEndurance && (
                <td className="live-team-cell live-col-team">
                  <span className="live-team-name">{row.team_name || '—'}</span>
                  <span className="live-team-times">
                    {row.team_session_display || '0:00'}
                    {' '}
                    {t('live_team_time_short')}
                    {' · '}
                    {row.driver_stint_display || row.current_stint?.duration_display || '0:00'}
                    {' '}
                    {t('live_driver_time_short')}
                  </span>
                </td>
              )}
              <td className="live-kart-cell live-col-kart">
                <span className="live-assign-kart-num">{row.kart_number}</span>
              </td>
              <td className="live-driver-name live-col-driver">
                <span className="live-timing-driver-name">{driverLabel}</span>
              </td>
              {isEndurance && (
                <td className="live-lap-count live-col-laps-fixed">{row.lap_count ?? row.total_laps ?? 0}</td>
              )}
              <td className="live-col-lap live-last-lap-cell">
                {formatLapCell(row.best_lap_time)}
              </td>
              <td className={`live-col-lap live-last-lap-cell${sessionFastestLap ? ' live-last-pb' : ''}`}>
                {formatLapCell(row.last_lap_time)}
              </td>
              {optionalCols.map((col) => renderOptionalCell(col, row, leader, heatType, t))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
