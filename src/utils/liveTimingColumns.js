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

export const LAP_TIMING_COLUMNS = [
  { id: 'best_lap', labelKey: 'best_lap', group: 'session' },
  { id: 'last_lap', labelKey: 'last_lap', group: 'session' },
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

export const ALL_TIMING_COLUMNS = [...LAP_TIMING_COLUMNS, ...OPTIONAL_TIMING_COLUMNS];

export const DEFAULT_TIMING_COLUMN_ORDER = ALL_TIMING_COLUMNS.map((col) => col.id);

const LAP_COLUMN_IDS = new Set(LAP_TIMING_COLUMNS.map((col) => col.id));
const ALL_COLUMN_IDS = new Set(ALL_TIMING_COLUMNS.map((col) => col.id));

export function normalizeTimingColumns(raw) {
  const base = { ...DEFAULT_TIMING_COLUMNS };
  if (!raw || typeof raw !== 'object') return base;
  OPTIONAL_TIMING_COLUMNS.forEach(({ id }) => {
    if (typeof raw[id] === 'boolean') base[id] = raw[id];
  });
  return base;
}

export function normalizeTimingColumnOrder(raw) {
  const order = Array.isArray(raw) ? raw.filter((id) => ALL_COLUMN_IDS.has(id)) : [];
  DEFAULT_TIMING_COLUMN_ORDER.forEach((id) => {
    if (!order.includes(id)) order.push(id);
  });
  return order;
}

export function getOrderedTimingColumns(timingColumns, columnOrder) {
  const order = normalizeTimingColumnOrder(columnOrder);
  return order
    .filter((id) => LAP_COLUMN_IDS.has(id) || timingColumns?.[id])
    .map((id) => ALL_TIMING_COLUMNS.find((col) => col.id === id))
    .filter(Boolean);
}

/** @deprecated use getOrderedTimingColumns */
export function getOrderedOptionalColumns(timingColumns, columnOrder) {
  return getOrderedTimingColumns(timingColumns, columnOrder)
    .filter((col) => !LAP_COLUMN_IDS.has(col.id));
}

export function moveColumnOrder(order, columnId, direction) {
  const next = [...normalizeTimingColumnOrder(order)];
  const idx = next.indexOf(columnId);
  if (idx < 0) return next;
  const target = idx + direction;
  if (target < 0 || target >= next.length) return next;
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

export function formatLapCell(value) {
  return value || '--.---';
}

function formatLapGap(count) {
  if (count === 1) return '+1 Lap';
  return `+${count} Laps`;
}

function trackGapSeconds(row, leader, lapToSec) {
  const leaderPos = leader.track_position ?? 0;
  const rowPos = row.track_position ?? 0;
  const trackGap = leaderPos - rowPos;
  if (trackGap <= 0.001) return null;

  const leaderLap = lapToSec(leader.last_lap_time);
  const rowLap = lapToSec(row.last_lap_time);
  const paceSec = leaderLap !== Infinity ? leaderLap : (rowLap !== Infinity ? rowLap : 45);
  const estSec = trackGap * paceSec;
  if (estSec < 0.05) return null;
  return estSec;
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

  if (lapDiff >= 1) {
    return formatLapGap(lapDiff);
  }

  if (lapDiff < 0) return '—';

  if (heatType === 'endurance') {
    const leaderPen = leader.unserved_penalty_sec || 0;
    const rowPen = row.unserved_penalty_sec || 0;
    if (rowPen > leaderPen) return `+${rowPen - leaderPen}s`;
  }

  const estSec = trackGapSeconds(row, leader, lapToSeconds);
  if (estSec != null) return `+${estSec.toFixed(3)}`;

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
