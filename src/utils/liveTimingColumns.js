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

/** First three columns are always fixed: position, kart, driver/team name. */
export const FIXED_TIMING_COLUMN_IDS = ['pos', 'kart', 'driver'];

export const LAYOUT_TIMING_COLUMNS = [
  { id: 'pos', labelKey: 'pos', group: 'layout', alwaysOn: true, fixed: true },
  { id: 'kart', labelKey: 'kart', group: 'layout', alwaysOn: true, fixed: true },
  { id: 'driver', labelKey: 'driver', group: 'layout', alwaysOn: true, fixed: true },
  { id: 'team', labelKey: 'team', group: 'layout', enduranceOnly: true },
  { id: 'laps_fixed', labelKey: 'laps', group: 'layout', enduranceOnly: true },
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

export const ALL_TIMING_COLUMNS = [
  ...LAYOUT_TIMING_COLUMNS,
  ...LAP_TIMING_COLUMNS,
  ...OPTIONAL_TIMING_COLUMNS,
];

export const DEFAULT_TIMING_COLUMN_ORDER = ALL_TIMING_COLUMNS.map((col) => col.id);

const LAP_COLUMN_IDS = new Set(LAP_TIMING_COLUMNS.map((col) => col.id));
const ALL_COLUMN_IDS = new Set([
  ...ALL_TIMING_COLUMNS.map((col) => col.id),
  'kart_driver',
]);
const LAYOUT_ALWAYS_ON = new Set(
  LAYOUT_TIMING_COLUMNS.filter((col) => col.alwaysOn).map((col) => col.id),
);

export function isFixedTimingColumn(columnId) {
  return FIXED_TIMING_COLUMN_IDS.includes(columnId);
}

function migrateColumnOrderIds(raw) {
  const migrated = [];
  (Array.isArray(raw) ? raw : []).forEach((id) => {
    if (id === 'kart_driver') {
      if (!migrated.includes('kart')) migrated.push('kart');
      if (!migrated.includes('driver')) migrated.push('driver');
    } else if (ALL_COLUMN_IDS.has(id) && !migrated.includes(id)) {
      migrated.push(id);
    }
  });
  return migrated;
}

export function normalizeTimingColumns(raw) {
  const base = { ...DEFAULT_TIMING_COLUMNS };
  if (!raw || typeof raw !== 'object') return base;
  OPTIONAL_TIMING_COLUMNS.forEach(({ id }) => {
    if (typeof raw[id] === 'boolean') base[id] = raw[id];
  });
  return base;
}

export function normalizeTimingColumnOrder(raw) {
  const order = migrateColumnOrderIds(raw);
  const reorderable = order.filter((id) => !isFixedTimingColumn(id) && ALL_COLUMN_IDS.has(id));
  DEFAULT_TIMING_COLUMN_ORDER.forEach((id) => {
    if (!isFixedTimingColumn(id) && !reorderable.includes(id)) reorderable.push(id);
  });
  return [...FIXED_TIMING_COLUMN_IDS, ...reorderable];
}

function isColumnVisible(col, timingColumns, isEndurance) {
  if (col.enduranceOnly && !isEndurance) return false;
  if (col.alwaysOn || LAYOUT_ALWAYS_ON.has(col.id)) return true;
  if (LAP_COLUMN_IDS.has(col.id)) return true;
  return Boolean(timingColumns?.[col.id]);
}

export function getOrderedTimingColumns(timingColumns, columnOrder, isEndurance = false) {
  const order = normalizeTimingColumnOrder(columnOrder);
  return order
    .filter((id) => {
      const col = ALL_TIMING_COLUMNS.find((c) => c.id === id);
      return col && isColumnVisible(col, timingColumns, isEndurance);
    })
    .map((id) => ALL_TIMING_COLUMNS.find((col) => col.id === id))
    .filter(Boolean);
}

export function getReorderableTimingColumns(timingColumns, columnOrder, isEndurance = false) {
  return getOrderedTimingColumns(timingColumns, columnOrder, isEndurance)
    .filter((col) => !isFixedTimingColumn(col.id));
}

/** @deprecated use getOrderedTimingColumns */
export function getOrderedOptionalColumns(timingColumns, columnOrder, isEndurance = false) {
  return getOrderedTimingColumns(timingColumns, columnOrder, isEndurance)
    .filter((col) => !LAYOUT_ALWAYS_ON.has(col.id) && col.id !== 'team' && col.id !== 'laps_fixed');
}

export function moveColumnOrder(order, columnId, direction) {
  if (isFixedTimingColumn(columnId)) return normalizeTimingColumnOrder(order);
  const next = [...normalizeTimingColumnOrder(order)];
  const idx = next.indexOf(columnId);
  if (idx < 0) return next;
  const fixedLen = FIXED_TIMING_COLUMN_IDS.length;
  const target = idx + direction;
  if (target < fixedLen || target >= next.length) return next;
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

export function formatLapCell(value) {
  return value || '--.---';
}

export function isPersonalBestLap(row) {
  if (!row?.last_lap_time || !row?.best_lap_time) return false;
  const last = lapToSeconds(row.last_lap_time);
  const best = lapToSeconds(row.best_lap_time);
  return last !== Infinity && best !== Infinity && last === best;
}

function formatLapGap(count) {
  if (count === 1) return '+1 Lap';
  return `+${count} Laps`;
}

function trackGapSeconds(row, ahead, lapToSec) {
  const aheadPos = ahead.track_position ?? 0;
  const rowPos = row.track_position ?? 0;
  const trackGap = aheadPos - rowPos;
  if (trackGap <= 0.001) return null;

  const aheadLap = lapToSec(ahead.last_lap_time);
  const rowLap = lapToSec(row.last_lap_time);
  const paceSec = aheadLap !== Infinity ? aheadLap : (rowLap !== Infinity ? rowLap : 45);
  const estSec = trackGap * paceSec;
  if (estSec < 0.05) return null;
  return estSec;
}

/** Gap to the car directly ahead in classification (P1 shows —). */
export function gapToCarAhead(row, ahead, heatType, lapToSecondsFn = lapToSeconds) {
  if (!row) return '--.---';
  if (!ahead) return '—';

  if (heatType === 'time') {
    const aheadBest = lapToSecondsFn(ahead.best_lap_time);
    const rowBest = lapToSecondsFn(row.best_lap_time);
    if (aheadBest === Infinity || rowBest === Infinity) return '--.---';
    const gap = rowBest - aheadBest;
    if (gap <= 0) return '—';
    return `+${gap.toFixed(3)}`;
  }

  const aheadLaps = ahead.lap_count || 0;
  const rowLaps = row.lap_count || 0;
  const lapDiff = aheadLaps - rowLaps;

  if (lapDiff >= 1) {
    return formatLapGap(lapDiff);
  }

  if (lapDiff < 0) return '—';

  if (heatType === 'endurance') {
    const aheadPen = ahead.unserved_penalty_sec || 0;
    const rowPen = row.unserved_penalty_sec || 0;
    if (rowPen > aheadPen) return `+${rowPen - aheadPen}s`;
  }

  const estSec = trackGapSeconds(row, ahead, lapToSecondsFn);
  if (estSec != null) return `+${estSec.toFixed(3)}`;

  return '—';
}

/** @deprecated use gapToCarAhead — kept for tests */
export function gapToLeader(row, leader, heatType, lapToSecondsFn) {
  return gapToCarAhead(row, leader, heatType, lapToSecondsFn);
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
