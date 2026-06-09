import React, { useMemo } from 'react';
import {
  getOrderedTimingColumns,
  formatLapCell,
  gapToCarAhead,
  isPersonalBestLap,
  lapToSeconds,
} from '../utils/liveTimingColumns.js';

function renderLapCell(col, row) {
  const pbCrossing = isPersonalBestLap(row);
  if (col.id === 'best_lap') {
    return (
      <td key={col.id} className={`live-col-lap${row.best_lap_time ? ' live-best-pb' : ''}`}>
        {formatLapCell(row.best_lap_time)}
      </td>
    );
  }
  return (
    <td key={col.id} className={`live-col-lap${pbCrossing ? ' live-last-pb' : ''}`}>
      {formatLapCell(row.last_lap_time)}
    </td>
  );
}

function renderOptionalCell(col, row, ahead, heatType, t) {
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
        {gapToCarAhead(row, ahead, heatType, lapToSeconds)}
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

function renderLayoutHeader(col, t, isEndurance) {
  if (col.id === 'pos') {
    return <th key={col.id} className="live-col-pos">{t('pos')}</th>;
  }
  if (col.id === 'kart') {
    return <th key={col.id} className="live-col-kart">{t('kart')}</th>;
  }
  if (col.id === 'driver') {
    return (
      <th key={col.id} className="live-col-driver">
        {isEndurance ? t('live_col_stint_driver') : t('driver')}
      </th>
    );
  }
  if (col.id === 'team') {
    return <th key={col.id} className="live-col-team">{t('team')}</th>;
  }
  if (col.id === 'laps_fixed') {
    return <th key={col.id} className="live-col-laps-fixed">{t('laps')}</th>;
  }
  return null;
}

function renderLayoutCell(col, row, index, t, isEndurance) {
  if (col.id === 'pos') {
    return <td key={col.id} className="live-pos live-col-pos">{index + 1}</td>;
  }
  if (col.id === 'kart') {
    return (
      <td key={col.id} className="live-kart-cell live-col-kart">
        <span className="live-assign-kart-num">{row.kart_number}</span>
      </td>
    );
  }
  if (col.id === 'driver') {
    const driverLabel = isEndurance
      ? (row.active_driver || row.current_stint?.driver_name || row.driver_name || t('anonymous'))
      : (row.driver_name || t('anonymous'));
    return (
      <td key={col.id} className="live-driver-name live-col-driver">
        <span className="live-timing-driver-name">{driverLabel}</span>
      </td>
    );
  }
  if (col.id === 'team') {
    return (
      <td key={col.id} className="live-team-cell live-col-team">
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
    );
  }
  if (col.id === 'laps_fixed') {
    return (
      <td key={col.id} className="live-lap-count live-col-laps-fixed">
        {row.lap_count ?? row.total_laps ?? 0}
      </td>
    );
  }
  return null;
}

function renderColumnHeader(col, t) {
  if (col.id === 'best_lap' || col.id === 'last_lap') {
    return <th key={col.id} className="live-col-lap">{t(col.labelKey)}</th>;
  }
  return (
    <th key={col.id} className={`live-col-optional live-col-${col.group}`}>{t(col.labelKey)}</th>
  );
}

function renderColumnCell(col, row, ahead, heatType, t) {
  if (col.id === 'best_lap' || col.id === 'last_lap') {
    return renderLapCell(col, row);
  }
  return renderOptionalCell(col, row, ahead, heatType, t);
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
  const displayCols = useMemo(
    () => getOrderedTimingColumns(timingColumns, timingColumnOrder, isEndurance),
    [timingColumns, timingColumnOrder, isEndurance],
  );

  return (
    <table className={tableClassName}>
      <thead>
        <tr>
          {displayCols.map((col) => {
            if (col.group === 'layout') return renderLayoutHeader(col, t, isEndurance);
            return renderColumnHeader(col, t);
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const ahead = index > 0 ? rows[index - 1] : null;
          return (
            <tr
              key={`timing-${row.kart_number}-${index}`}
              className={`${rowFlashClass(row, index)}${row.in_pits ? ' live-in-pits-row' : ''}`}
            >
              {displayCols.map((col) => {
                if (col.group === 'layout') {
                  return renderLayoutCell(col, row, index, t, isEndurance);
                }
                return renderColumnCell(col, row, ahead, heatType, t);
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
