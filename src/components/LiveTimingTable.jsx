import React, { useMemo } from 'react';
import {
  getOrderedTimingColumns,
  formatLapCell,
  computeTimingGap,
  isHeatFastestBestLap,
  isPersonalBestLap,
  lapToSeconds,
} from '../utils/liveTimingColumns.js';
import useAlternatingLabel from '../hooks/useAlternatingLabel.js';

function EnduranceDriverCell({ row, t }) {
  const teamName = row.team_name || '';
  const driverName = row.active_driver || row.current_stint?.driver_name || row.driver_name || t('anonymous');
  const label = useAlternatingLabel(teamName, driverName, 7000, 3000);
  return (
    <span className="live-timing-driver-name" title={`${teamName} · ${driverName}`}>
      {label}
    </span>
  );
}

function renderLapCell(col, row, rows) {
  const pbCrossing = isPersonalBestLap(row);
  if (col.id === 'best_lap') {
    const heatFastest = isHeatFastestBestLap(row, rows);
    return (
      <td key={col.id} className={`live-col-lap${heatFastest ? ' live-best-pb' : ''}`}>
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

function renderOptionalCell(col, row, gapRefs, heatType, t) {
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
        {computeTimingGap(row, gapRefs, heatType, lapToSeconds)}
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
        {isEndurance ? t('live_col_team_driver') : t('driver')}
      </th>
    );
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
    if (isEndurance) {
      return (
        <td key={col.id} className="live-driver-name live-col-driver">
          <EnduranceDriverCell row={row} t={t} />
        </td>
      );
    }
    return (
      <td key={col.id} className="live-driver-name live-col-driver">
        <span className="live-timing-driver-name">{row.driver_name || t('anonymous')}</span>
      </td>
    );
  }
  return null;
}

function renderColumnHeader(col, t, heatType) {
  if (col.id === 'best_lap' || col.id === 'last_lap') {
    return <th key={col.id} className="live-col-lap">{t(col.labelKey)}</th>;
  }
  if (col.id === 'gap') {
    const labelKey = heatType === 'time' ? 'live_col_gap_leader' : 'live_col_gap';
    return (
      <th key={col.id} className={`live-col-optional live-col-${col.group}`}>{t(labelKey)}</th>
    );
  }
  return (
    <th key={col.id} className={`live-col-optional live-col-${col.group}`}>{t(col.labelKey)}</th>
  );
}

function renderColumnCell(col, row, gapRefs, heatType, t, rows) {
  if (col.id === 'best_lap' || col.id === 'last_lap') {
    return renderLapCell(col, row, rows);
  }
  return renderOptionalCell(col, row, gapRefs, heatType, t);
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
            return renderColumnHeader(col, t, heatType);
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const leader = rows[0] || null;
          const ahead = index > 0 ? rows[index - 1] : null;
          const gapRefs = { leader, ahead };
          return (
            <tr
              key={`timing-${row.kart_number}-${index}`}
              className={`${rowFlashClass(row, index)}${row.in_pits ? ' live-in-pits-row' : ''}`}
            >
              {displayCols.map((col) => {
                if (col.group === 'layout') {
                  return renderLayoutCell(col, row, index, t, isEndurance);
                }
                return renderColumnCell(col, row, gapRefs, heatType, t, rows);
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
