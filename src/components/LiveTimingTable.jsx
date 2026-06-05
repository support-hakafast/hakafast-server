import React, { useMemo } from 'react';
import {
  OPTIONAL_TIMING_COLUMNS,
  formatLapCell,
  gapToLeader,
  lapToSeconds,
} from '../utils/liveTimingColumns.js';

function isPersonalBestLap(row) {
  if (!row?.last_lap_time || !row?.best_lap_time) return false;
  return row.last_lap_time === row.best_lap_time || row.is_personal_best;
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
  const leaderBestSec = useMemo(() => {
    if (mode !== 'timing' || !rows.length || isEndurance) return Infinity;
    return lapToSeconds(rows[0]?.best_lap_time);
  }, [mode, rows, isEndurance]);

  if (mode === 'assignments') {
    return (
      <table className={tableClassName}>
        <thead>
          <tr>
            <th>#</th>
            {isEndurance && <th>{t('team')}</th>}
            <th>{t('kart')}</th>
            <th>{isEndurance ? t('team_drivers') : t('driver')}</th>
            {isEndurance && <th>{t('laps')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`assign-${row.position ?? index}-${row.kart_number || row.driver_name}`} className={rowFlashClass(row, index)}>
              <td className="live-pos">{row.position ?? index + 1}</td>
              {isEndurance && <td className="live-team-name">{row.team_name || '—'}</td>}
              <td>{row.kart_number ?? '—'}</td>
              <td style={{ textAlign: 'start' }}>{isEndurance ? formatTeamDrivers(row) : row.driver_name}</td>
              {isEndurance && <td>{row.lap_count ?? 0}</td>}
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
          {isEndurance && <th>{t('team')}</th>}
          <th>{t('kart')}</th>
          <th>{isEndurance ? t('team_drivers') : t('driver')}</th>
          {isEndurance && <th>{t('laps')}</th>}
          {!isEndurance && <th className="live-col-highlight">{t('best_lap')}</th>}
          <th className="live-col-highlight">{t('last_lap')}</th>
          {optionalCols.map((col) => (
            <th key={col.id}>{t(col.labelKey)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const isLeader = index === 0;
          const pbLap = isPersonalBestLap(row);
          return (
            <tr key={`timing-${row.kart_number}-${index}`} className={rowFlashClass(row, index)}>
              <td className="live-pos">{index + 1}</td>
              {isEndurance && <td className="live-team-name">{row.team_name || '—'}</td>}
              <td>{row.kart_number}</td>
              <td style={{ textAlign: 'start' }}>
                {isLeader && '👑 '}
                {isEndurance ? formatTeamDrivers(row) : (row.driver_name || t('anonymous'))}
              </td>
              {isEndurance && <td className="live-lap-count">{row.lap_count ?? row.total_laps ?? 0}</td>}
              {!isEndurance && (
                <td className="live-col-highlight">
                  {formatLapCell(row.best_lap_time)}
                </td>
              )}
              <td className={`live-col-highlight live-last-lap${pbLap ? ' live-last-pb' : ''}`}>
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
