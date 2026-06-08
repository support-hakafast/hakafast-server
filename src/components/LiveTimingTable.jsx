import React, { useMemo } from 'react';
import {
  OPTIONAL_TIMING_COLUMNS,
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

function formatTeamDrivers(row) {
  if (Array.isArray(row.team_drivers) && row.team_drivers.length) {
    return row.team_drivers.join(' · ');
  }
  return row.driver_name || '';
}

export default function LiveTimingTable({
  t,
  mode,
  rows,
  timingColumns,
  heatType = 'time',
  rowFlashClass,
  tableClassName = 'live-timing-table',
}) {
  const isEndurance = heatType === 'endurance';
  const leader = useMemo(() => (mode === 'timing' && rows.length ? rows[0] : null), [mode, rows]);

  const optionalCols = OPTIONAL_TIMING_COLUMNS.filter((col) => timingColumns?.[col.id]);

  return (
    <table className={tableClassName}>
      <thead>
        <tr>
          <th>{t('pos')}</th>
          {isEndurance && <th>{t('team')}</th>}
          <th>{t('kart')}</th>
          <th>{isEndurance ? t('team_drivers') : t('driver')}</th>
          {isEndurance && <th>{t('laps')}</th>}
          <th className="live-col-highlight">{t('best_lap')}</th>
          <th className="live-col-highlight">{t('last_lap')}</th>
          {optionalCols.map((col) => (
            <th key={col.id} className={`live-col-optional live-col-${col.group}`}>{t(col.labelKey)}</th>
          ))}
          {isEndurance && timingColumns?.stint && <th>{t('live_col_stint_driver')}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const isLeader = index === 0 && hasLeaderTiming(row, heatType);
          const sessionFastestLap = isSessionFastestLap(row);
          const driverLabel = isEndurance ? formatTeamDrivers(row) : (row.driver_name || t('anonymous'));
          return (
            <tr
              key={`timing-${row.kart_number}-${index}`}
              className={`${rowFlashClass(row, index)}${isLeader ? ' live-leader-row' : ''}${row.in_pits ? ' live-in-pits-row' : ''}`}
            >
              <td className="live-pos">{index + 1}</td>
              {isEndurance && <td className="live-team-name">{row.team_name || '—'}</td>}
              <td className="live-kart-num">{row.kart_number}</td>
              <td className="live-driver-name">
                {driverLabel}
              </td>
              {isEndurance && <td className="live-lap-count">{row.lap_count ?? row.total_laps ?? 0}</td>}
              <td className="live-col-highlight">
                {formatLapCell(row.best_lap_time)}
              </td>
              <td className={`live-col-highlight live-last-lap${sessionFastestLap ? ' live-last-pb' : ''}`}>
                {formatLapCell(row.last_lap_time)}
              </td>
              {optionalCols.map((col) => {
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
                  return <td key={col.id} className={cellClass}>{row.driver_level ? t(`level_${row.driver_level.toLowerCase()}`) : '—'}</td>;
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
              })}
              {isEndurance && timingColumns?.stint && (
                <td className="live-stint-driver">
                  {row.in_pits ? t('live_in_pits') : (row.current_stint?.driver_name || row.active_driver || '—')}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
