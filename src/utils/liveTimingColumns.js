export const DEFAULT_TIMING_COLUMNS = {
  laps: true,
  second_best: false,
  avg_lap: false,
  level: false,
  gap: true,
  pit_visits: false,
  pit_time: false,
  penalty: false,
  stint: false,
};

export const ENDURANCE_DEFAULT_COLUMNS = {
  ...DEFAULT_TIMING_COLUMNS,
  pit_visits: true,
  pit_time: true,
  penalty: true,
  stint: true,
};

export const TIMING_COLUMN_GROUPS = [
  {
    id: 'session',
    labelKey: 'admin_timing_group_session',
    descriptionKey: 'admin_timing_group_session_hint',
  },
  {
    id: 'race',
    labelKey: 'admin_timing_group_race',
    descriptionKey: 'admin_timing_group_race_hint',
  },
];

export const OPTIONAL_TIMING_COLUMNS = [
  { id: 'laps', labelKey: 'laps', group: 'session' },
  { id: 'second_best', labelKey: 'live_col_second_best', group: 'session' },
  { id: 'avg_lap', labelKey: 'live_col_avg_lap', group: 'session' },
  { id: 'level', labelKey: 'live_col_level', group: 'session' },
  { id: 'gap', labelKey: 'live_col_gap', group: 'session' },
  { id: 'pit_visits', labelKey: 'live_col_pit_visits', group: 'race' },
  { id: 'pit_time', labelKey: 'live_col_pit_time', group: 'race' },
  { id: 'penalty', labelKey: 'live_col_penalty', group: 'race' },
  { id: 'stint', labelKey: 'live_col_stint', group: 'race' },
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
    const leaderPen = leader.unserved_penalty_sec || 0;
    const rowPen = row.unserved_penalty_sec || 0;
    if (rowPen > leaderPen) return `+${rowPen - leaderPen}s`;
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
