import React, { useState } from 'react';
import { formatLapCell } from '../utils/liveTimingColumns.js';

const PERIODS = ['day', 'week', 'month'];

function driverLabel(row) {
  if (row.team_name && row.stint_driver) return `${row.team_name} · ${row.stint_driver}`;
  if (row.team_name) return row.team_name;
  return row.driver_name || row.stint_driver || '—';
}

export default function LiveLapStats({ t, topLaps, heatNumber }) {
  const [period, setPeriod] = useState('day');
  const laps = topLaps?.[period] || [];

  return (
    <aside className="live-lap-stats">
      <div className="live-lap-stats-head">
        <h2>{t('live_stats_title')}</h2>
        {heatNumber ? (
          <span className="live-heat-number-badge">
            {t('live_heat_number', { n: heatNumber })}
          </span>
        ) : null}
      </div>
      <div className="live-stats-period-tabs">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            className={period === p ? 'active' : ''}
            onClick={() => setPeriod(p)}
          >
            {t(`live_stats_${p}`)}
          </button>
        ))}
      </div>
      {laps.length === 0 ? (
        <p className="live-stats-empty">{t('live_stats_empty')}</p>
      ) : (
        <ol className="live-stats-list">
          {laps.map((row) => (
            <li key={`${period}-${row.position}-${row.lap_time}-${row.driver_name}`}>
              <span className="live-stats-pos">{row.position}</span>
              <span className="live-stats-time">{formatLapCell(row.lap_time)}</span>
              <span className="live-stats-driver">{driverLabel(row)}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
