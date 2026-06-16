/**
 * Championship data model and helpers.
 *
 * A championship tracks points across multiple race events.
 * - Sprint → individual driver standings
 * - Endurance → team standings (with driver participation log)
 *
 * Championship object shape:
 * {
 *   id: string (uuid-ish),
 *   name: string,
 *   type: 'sprint' | 'endurance',
 *   pointsTable: number[],   // [P1 pts, P2 pts, ...] e.g. [25,18,15,12,10,8,6,4,2,1]
 *   rounds: ChampionshipRound[],
 *   createdAt: number,
 *   updatedAt: number,
 * }
 *
 * ChampionshipRound:
 * {
 *   id: string,
 *   label: string,           // e.g. "Round 1 – Eilat"
 *   date: string | null,     // ISO date string
 *   results: RoundResult[],  // ordered P1…Pn
 *   heatHistoryRef: string | null,  // heat_number or null if entered manually
 * }
 *
 * RoundResult (sprint):
 * { name: string, position: number }
 *
 * RoundResult (endurance):
 * { name: string, position: number, drivers: string[] }
 */

export const DEFAULT_POINTS_TABLES = {
  f1: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  simple: [3, 2, 1],
  top5: [10, 7, 5, 3, 1],
  karting: [15, 12, 10, 8, 6, 4, 3, 2, 1],
};

export function createChampionship({ name, type = 'sprint', pointsTable = DEFAULT_POINTS_TABLES.karting, adminPassword = '' }) {
  return {
    id: generateId(),
    name: name.trim(),
    type,
    pointsTable: [...pointsTable],
    rounds: [],
    adminPassword: adminPassword || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createRound({
  label = '',
  date = null,
  time = null,
  results = [],
  heatHistoryRef = null,
  isOfficial = false,
  trackSlug = null,
  eventPlan = null,
} = {}) {
  return {
    id: generateId(),
    label: label.trim(),
    date,
    time,
    results,
    heatHistoryRef,
    isOfficial,
    trackSlug,
    eventPlan,
  };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Compute championship standings from all rounds.
 * Returns array sorted by total points desc, then by wins desc, then by name asc.
 *
 * Each entry: { name, points, wins, podiums, roundPoints: number[], roundPositions: number[] }
 */
export function computeStandings(championship) {
  const { rounds = [], pointsTable = [] } = championship;
  const map = new Map(); // name → entry

  const ensure = (name) => {
    if (!map.has(name)) {
      map.set(name, {
        name,
        points: 0,
        wins: 0,
        podiums: 0,
        roundPoints: rounds.map(() => null),
        roundPositions: rounds.map(() => null),
      });
    }
    return map.get(name);
  };

  rounds.forEach((round, ri) => {
    (round.results || []).forEach((r) => {
      const entry = ensure(r.name);
      const pos = r.position; // 1-based
      const pts = pos >= 1 && pos <= pointsTable.length ? pointsTable[pos - 1] : 0;
      entry.points += pts;
      entry.roundPoints[ri] = pts;
      entry.roundPositions[ri] = pos;
      if (pos === 1) entry.wins += 1;
      if (pos <= 3) entry.podiums += 1;
    });
  });

  const standings = [...map.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.podiums !== a.podiums) return b.podiums - a.podiums;
    return a.name.localeCompare(b.name);
  });

  return standings.map((s, i) => ({ ...s, position: i + 1 }));
}

/**
 * Build a results array from a heat_history entry.
 * For sprint: driver name = driver_name | name, position from results order.
 * For endurance: team name = team | team_name, position from results order.
 * Heat history results should already be sorted by position.
 */
export function resultsFromHeatHistory(heatEntry, type) {
  const rows = heatEntry?.results || [];
  return rows
    .filter((r) => r && (r.driver_name || r.name || r.team || r.team_name))
    .map((r, i) => {
      const name = type === 'endurance'
        ? (r.team || r.team_name || r.driver_name || r.name || '')
        : (r.driver_name || r.name || '');
      const result = { name: name.trim(), position: i + 1 };
      if (type === 'endurance') {
        const drivers = [];
        if (Array.isArray(r.team_drivers)) drivers.push(...r.team_drivers.map((d) => (d?.name || d || '').trim()).filter(Boolean));
        else if (r.driver_name) drivers.push(r.driver_name);
        result.drivers = drivers;
      }
      return result;
    });
}

/**
 * Export standings to CSV string.
 */
export function exportStandingsCsv(championship) {
  const standings = computeStandings(championship);
  const { rounds = [], type } = championship;

  const headerCols = ['Pos', type === 'endurance' ? 'Team' : 'Driver', 'Points', 'Wins', 'Podiums'];
  rounds.forEach((r) => headerCols.push(r.label || `Round ${r.id}`));

  const rows = [headerCols];
  standings.forEach((s) => {
    const row = [s.position, s.name, s.points, s.wins, s.podiums];
    s.roundPoints.forEach((p) => row.push(p ?? ''));
    rows.push(row);
  });

  return rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

/**
 * Parse a simple CSV for manual round entry.
 * Columns: position (or auto-numbered), name/driver/team
 * Returns RoundResult[]
 */
export function parseRoundResultsCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const firstCells = lines[0].split(/[,;]/).map((c) => c.replace(/^["']|["']$/g, '').trim().toLowerCase());
  const hasPosCol = /^(pos|position|place|#)$/.test(firstCells[0]);
  const hasNameCol = firstCells.findIndex((c) => /^(name|driver|team|participant)$/.test(c)) !== -1;

  const dataLines = (hasPosCol || hasNameCol) ? lines.slice(1) : lines;

  const results = [];
  dataLines.forEach((line, i) => {
    const cells = line.split(/[,;]/).map((c) => c.replace(/^["']|["']$/g, '').trim());
    if (!cells.length || !cells[0]) return;

    let position, name;
    if (hasPosCol) {
      position = parseInt(cells[0], 10) || i + 1;
      name = cells[1] || '';
    } else {
      position = i + 1;
      name = cells[0];
    }
    if (name) results.push({ name, position });
  });

  return results;
}

export function normalizeChampionship(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id || generateId(),
    name: raw.name || '',
    type: raw.type === 'endurance' ? 'endurance' : 'sprint',
    pointsTable: Array.isArray(raw.pointsTable) ? raw.pointsTable.map(Number).filter((n) => !Number.isNaN(n)) : [...DEFAULT_POINTS_TABLES.karting],
    rounds: Array.isArray(raw.rounds) ? raw.rounds.map(normalizeRound) : [],
    adminPassword: raw.adminPassword || '',
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

function normalizeRound(raw) {
  return {
    id: raw.id || generateId(),
    label: raw.label || '',
    date: raw.date || null,
    time: raw.time || null,
    results: Array.isArray(raw.results) ? raw.results : [],
    heatHistoryRef: raw.heatHistoryRef || null,
    isOfficial: Boolean(raw.isOfficial),
    trackSlug: raw.trackSlug || null,
    eventPlan: raw.eventPlan || null,
  };
}

/** Strip sensitive fields before sending to unauthenticated viewers */
export function sanitizeChampionshipForPublic(c) {
  const { adminPassword: _pw, ...pub } = c;
  return {
    ...pub,
    rounds: (pub.rounds || []).map(({ eventPlan: _ep, ...r }) => r),
    hasPassword: Boolean(_pw),
  };
}

/** Get rounds for a specific track that are scheduled today */
export function getRoundsForTrackToday(championships, trackSlug) {
  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  for (const c of championships) {
    for (const r of c.rounds || []) {
      if (r.trackSlug === trackSlug && r.date === today) {
        results.push({ championship: c, round: r });
      }
    }
  }
  return results;
}

/** Compute standings using only official rounds */
export function computeOfficialStandings(championship) {
  const officialOnly = {
    ...championship,
    rounds: (championship.rounds || []).filter((r) => r.isOfficial),
  };
  return computeStandings(officialOnly);
}
