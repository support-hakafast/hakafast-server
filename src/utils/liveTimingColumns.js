export const DEFAULT_TIMING_COLUMNS = {
  laps: true,
  second_best: false,
  avg_lap: false,
  level: false,
  gap: false,
};

export const OPTIONAL_TIMING_COLUMNS = [
  { id: 'laps', labelKey: 'laps' },
  { id: 'second_best', labelKey: 'live_col_second_best' },
  { id: 'avg_lap', labelKey: 'live_col_avg_lap' },
  { id: 'level', labelKey: 'live_col_level' },
  { id: 'gap', labelKey: 'live_col_gap' },
];

export function normalizeTimingColumns(raw) {
  const base = { ...DEFAULT_TIMING_COLUMNS };
  if (!raw || typeof raw !== 'object') return base;
  OPTIONAL_TIMING_COLUMNS.forEach(({ id }) => {
    if (typeof raw[id] === 'boolean') base[id] = raw[id];
  });
  return base;
}

export function formatLapCell(value) {
  return value || '--.---';
}

export function gapToLeader(row, leader, heatType, lapToSeconds) {
  if (!row || !leader) return '--.---';

  if (heatType === 'time') {
    const leaderBest = lapToSeconds(leader.best_lap_time);
    const rowBest = lapToSeconds(row.best_lap_time);
    if (leaderBest === Infinity || rowBest === Infinity) return '--.---';
    const gap = rowBest - leaderBest;
    if (gap <= 0) return '—';
    return `+${gap.toFixed(3)}`;
  }

  const leaderLaps = leader.lap_count || 0;
  const rowLaps = row.lap_count || 0;
  const lapDiff = leaderLaps - rowLaps;
  if (lapDiff > 0) return `+${lapDiff}`;

  if (lapDiff === 0) {
    const leaderBest = lapToSeconds(leader.best_lap_time);
    const rowBest = lapToSeconds(row.best_lap_time);
    if (leaderBest !== Infinity && rowBest !== Infinity) {
      const gap = rowBest - leaderBest;
      if (gap <= 0) return '—';
      return `+${gap.toFixed(3)}`;
    }
    const trackGap = (leader.track_position || 0) - (row.track_position || 0);
    if (trackGap > 0.001) {
      const estSec = trackGap * 45;
      return `+${estSec.toFixed(3)}`;
    }
  }

  return '—';
}

export function lapToSeconds(lap) {
  if (!lap || typeof lap !== 'string') return Infinity;
  const trimmed = lap.trim();
  if (trimmed.includes(':')) {
    const [mins, secs] = trimmed.split(':');
    return (parseInt(mins, 10) || 0) * 60 + (parseFloat(secs) || 0);
  }
  const value = parseFloat(trimmed);
  return Number.isNaN(value) ? Infinity : value;
}
