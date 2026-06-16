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
];

export const LAP_TIMING_COLUMNS = [
  { id: 'best_lap', labelKey: 'best_lap', group: 'session' },
  { id: 'last_lap', labelKey: 'last_lap', group: 'session' },
];

export const OPTIONAL_TIMING_COLUMNS = [
  { id: 'laps', labelKey: 'laps', group: 'session', alwaysOn: true },
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

/** Default order: fixed cols, then laps (always on), then lap times, then optional. */
export const DEFAULT_TIMING_COLUMN_ORDER = [
  ...FIXED_TIMING_COLUMN_IDS,
  'laps',
  'best_lap',
  'last_lap',
  ...OPTIONAL_TIMING_COLUMNS.filter((c) => c.id !== 'laps').map((c) => c.id),
];

const LAP_COLUMN_IDS = new Set(LAP_TIMING_COLUMNS.map((col) => col.id));
const ALL_COLUMN_IDS = new Set([
  ...ALL_TIMING_COLUMNS.map((col) => col.id),
  'kart_driver',
  'laps_fixed',
  'team',
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
    } else if (id === 'laps_fixed') {
      if (!migrated.includes('laps')) migrated.push('laps');
    } else if (id === 'team') {
      /* merged into rotating driver cell for endurance */
    } else if (ALL_COLUMN_IDS.has(id) && !migrated.includes(id)) {
      migrated.push(id);
    }
  });
  return migrated;
}

export function normalizeTimingColumns(raw) {
  const base = { ...DEFAULT_TIMING_COLUMNS };
  if (!raw || typeof raw !== 'object') return base;
  OPTIONAL_TIMING_COLUMNS.forEach(({ id, alwaysOn }) => {
    if (alwaysOn) {
      base[id] = true;
    } else if (typeof raw[id] === 'boolean') {
      base[id] = raw[id];
    }
  });
  base.laps = true;
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
  if (col.id === 'laps') return timingColumns?.laps !== false;
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

/** Move a reorderable column before/onto another slot (drag-and-drop). */
export function reorderColumnOrder(order, fromColumnId, toColumnId) {
  if (fromColumnId === toColumnId) return normalizeTimingColumnOrder(order);
  if (isFixedTimingColumn(fromColumnId) || isFixedTimingColumn(toColumnId)) {
    return normalizeTimingColumnOrder(order);
  }
  const next = [...normalizeTimingColumnOrder(order)];
  const fromIdx = next.indexOf(fromColumnId);
  const toIdx = next.indexOf(toColumnId);
  if (fromIdx < 0 || toIdx < 0) return next;
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, fromColumnId);
  return next;
}

export function isCompetitiveHeatType(heatType) {
  return heatType === 'sprint' || heatType === 'endurance';
}

/** Column chip groups shown in admin for the selected heat type. */
export function getVisibleTimingColumnGroupIds(heatType) {
  if (heatType === 'endurance') return ['session', 'race'];
  return ['session'];
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

/** True when this row holds the single fastest best lap in the current heat. */
export function isHeatFastestBestLap(row, rows, lapToSecondsFn = lapToSeconds) {
  if (!row?.best_lap_time || !rows?.length) return false;
  const rowSec = lapToSecondsFn(row.best_lap_time);
  if (rowSec === Infinity) return false;
  let minSec = Infinity;
  for (const r of rows) {
    const sec = lapToSecondsFn(r.best_lap_time);
    if (sec !== Infinity && sec < minSec) minSec = sec;
  }
  return rowSec === minSec;
}

function formatLapGap(count) {
  if (count === 1) return '+1 Lap';
  return `+${count} Laps`;
}

function trackGapSeconds(row, ahead, lapToSec, lapDiff = 0) {
  const aheadPos = ahead.track_position ?? 0;
  const rowPos = row.track_position ?? 0;

  // When ahead is exactly one lap ahead (e.g. just crossed the line while row
  // hasn't yet), the positional gap wraps around: row is at ~0.9 and ahead is
  // at ~0.0, so naively aheadPos - rowPos is negative. The real fractional gap
  // is the remaining track fraction for row plus however far ahead has gone on
  // the new lap: (1 - rowPos) + aheadPos.
  const trackGap = lapDiff === 1 ? (1 - rowPos) + aheadPos : aheadPos - rowPos;
  if (trackGap <= 0.001) return null;

  const aheadLap = lapToSec(ahead.last_lap_time);
  const rowLap = lapToSec(row.last_lap_time);
  const paceSec = aheadLap !== Infinity ? aheadLap : (rowLap !== Infinity ? rowLap : 45);
  const estSec = trackGap * paceSec;
  if (estSec < 0.05) return null;
  return estSec;
}

/**
 * Gap by timing-line crossing order: once both karts have crossed the line
 * for the same lap, the gap is the crossing-timestamp delta. Correct through
 * mid-lap overtakes — whoever crossed first is ahead by definition.
 * Returns null for any other lap-count combination (handled by caller).
 */
function crossingGapSeconds(row, ahead) {
  const aheadLaps = ahead.lap_count || 0;
  const rowLaps = row.lap_count || 0;
  const lapDiff = aheadLaps - rowLaps;

  const aheadAt = ahead.last_lap_at;
  const rowAt = row.last_lap_at;
  if (!aheadAt || !rowAt) return null;

  if (lapDiff !== 0) return null;

  // Same lap: gap is purely crossing-time delta.
  const gap = (rowAt - aheadAt) / 1000;
  if (gap <= 0.001) return null;
  return gap;
}

/** Gap to session leader by best lap (time / best-lap mode only). P1 shows —. */
export function gapToLeaderBestLap(row, leader, lapToSecondsFn = lapToSeconds) {
  if (!row) return '--.---';
  if (!leader || Number(row.kart_number) === Number(leader.kart_number)) return '—';

  const leaderBest = lapToSecondsFn(leader.best_lap_time);
  const rowBest = lapToSecondsFn(row.best_lap_time);
  if (leaderBest === Infinity || rowBest === Infinity) return '--.---';
  const gap = rowBest - leaderBest;
  if (gap <= 0) return '—';
  return `+${gap.toFixed(3)}`;
}

/** Gap to the car directly ahead in classification (sprint / endurance). P1 shows —. */
export function gapToCarAhead(row, ahead, heatType, lapToSecondsFn = lapToSeconds) {
  if (!row) return '--.---';
  if (!ahead) return '—';

  const aheadLaps = ahead.lap_count || 0;
  const rowLaps = row.lap_count || 0;
  const lapDiff = aheadLaps - rowLaps;

  if (lapDiff >= 2) {
    return formatLapGap(lapDiff);
  }

  if (lapDiff < 0) return '—';

  if (heatType === 'endurance') {
    const aheadPen = ahead.unserved_penalty_sec || 0;
    const rowPen = row.unserved_penalty_sec || 0;
    if (rowPen > aheadPen) return `+${rowPen - aheadPen}s`;
  }

  // Once both karts have crossed the line for the same lap, crossing-time delta
  // is the authoritative gap — it stays correct through mid-lap overtakes.
  const crossingSec = crossingGapSeconds(row, ahead);
  if (crossingSec != null) return `+${crossingSec.toFixed(3)}`;

  // lapDiff=1 mid-lap window: leader crossed lap N, follower hasn't yet.
  // Use track position to estimate. trackGapSeconds handles the wrap-around
  // (follower at ~0.9, leader at ~0.0) when lapDiff=1 is passed.
  if (lapDiff === 1) {
    const estSec = trackGapSeconds(row, ahead, lapToSecondsFn, 1);
    if (estSec != null) return `+${estSec.toFixed(3)}`;
    return formatLapGap(1);
  }

  // Same lap, no crossing data yet (lap 1 in progress): estimate from position.
  const estSec = trackGapSeconds(row, ahead, lapToSecondsFn, 0);
  if (estSec != null) return `+${estSec.toFixed(3)}`;

  return '—';
}

/** Time mode = gap to leader; sprint/endurance = gap to car ahead. */
export function computeTimingGap(row, { leader, ahead }, heatType, lapToSecondsFn = lapToSeconds) {
  if (heatType === 'time') return gapToLeaderBestLap(row, leader, lapToSecondsFn);
  return gapToCarAhead(row, ahead, heatType, lapToSecondsFn);
}

/** @deprecated use computeTimingGap or gapToLeaderBestLap */
export function gapToLeader(row, leader, heatType, lapToSecondsFn) {
  if (heatType === 'time') return gapToLeaderBestLap(row, leader, lapToSecondsFn);
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
