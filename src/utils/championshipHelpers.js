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
  classic: [30, 25, 21, 18, 15, 12, 9, 6, 3, 1],
  f1: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  simple: [3, 2, 1],
  top5: [10, 7, 5, 3, 1],
  karting: [15, 12, 10, 8, 6, 4, 3, 2, 1],
};

/**
 * scope: 'singular' — one championship, one standings table (e.g. BRKC)
 * scope: 'multi-league' — parent championship with divisions each having their own standings,
 *          plus an overall "grand" standings that accumulates across all divisions (e.g. Rock Cup)
 */
export function createChampionship({ name, pointsTable = DEFAULT_POINTS_TABLES.karting, adminPassword = '', scope = 'singular' }) {
  return {
    id: generateId(),
    name: name.trim(),
    scope, // 'singular' | 'multi-league'
    allowedTypes: [],
    pointsTable: [...pointsTable],
    rounds: [],
    divisions: [], // sub-championships: [{ id, name, pointsTable, rounds[] }]
    venues: [], // [{ name: string, slug: string }] — reusable track list for this championship
    adminPassword: adminPassword || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createDivision({ name, pointsTable = DEFAULT_POINTS_TABLES.karting } = {}) {
  return {
    id: generateId(),
    name: (name || '').trim(),
    pointsTable: [...pointsTable],
    rounds: [],
  };
}

/**
 * Session plan entry (within a round):
 * {
 *   id: string,
 *   type: 'practice' | 'qualifying' | 'race' | 'ironcut',   // ironcut = solo timed endurance
 *   label: string,         // e.g. "Practice 1", "Qualifying", "Race"
 *   startTime: string,     // HH:MM
 *   durationMinutes: number,
 *   kartTransporter: boolean,  // karts move between sessions (transponder IDs reset)
 *   notes: string,
 * }
 */
export function createSession({ type = 'practice', label = '', startTime = '', durationMinutes = 15, kartTransporter = false, notes = '' } = {}) {
  return { id: generateId(), type, label, startTime, durationMinutes, kartTransporter, notes };
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
  raceType = 'sprint',
  sessions = [],
  divisionId = null,
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
    raceType,
    sessions, // SessionPlan[]
    divisionId,
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
    scope: raw.scope === 'multi-league' ? 'multi-league' : 'singular',
    type: raw.type === 'endurance' ? 'endurance' : 'sprint',
    allowedTypes: raw.allowedTypes || [],
    pointsTable: Array.isArray(raw.pointsTable) ? raw.pointsTable.map(Number).filter((n) => !Number.isNaN(n)) : [...DEFAULT_POINTS_TABLES.karting],
    rounds: Array.isArray(raw.rounds) ? raw.rounds.map(normalizeRound) : [],
    divisions: Array.isArray(raw.divisions) ? raw.divisions.map(normalizeDivision) : [],
    venues: Array.isArray(raw.venues) ? raw.venues.filter((v) => v && v.name) : [],
    adminPassword: raw.adminPassword || '',
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

function normalizeDivision(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id || generateId(),
    name: raw.name || '',
    pointsTable: Array.isArray(raw.pointsTable) ? raw.pointsTable.map(Number).filter((n) => !Number.isNaN(n)) : [...DEFAULT_POINTS_TABLES.karting],
    rounds: Array.isArray(raw.rounds) ? raw.rounds.map(normalizeRound) : [],
  };
}

/**
 * Compute standings for a single division.
 * Uses the division's own pointsTable and rounds.
 */
export function computeDivisionStandings(division) {
  return computeStandings({ pointsTable: division.pointsTable, rounds: division.rounds || [] });
}

/**
 * Compute overall championship standings across top-level rounds AND all divisions.
 * Points from top-level rounds use championship.pointsTable.
 * Points from each division use that division's own pointsTable.
 * All accumulated by participant name.
 */
export function computeOverallStandings(championship) {
  const map = new Map();

  function ensure(name, totalRounds) {
    if (!map.has(name)) map.set(name, { name, points: 0, wins: 0, podiums: 0, roundPoints: Array(totalRounds).fill(null), roundPositions: Array(totalRounds).fill(null) });
    return map.get(name);
  }

  // Count total rounds for column allocation
  const divRounds = (championship.divisions || []).flatMap((d) => d.rounds || []);
  const allRounds = [...(championship.rounds || []), ...divRounds];
  const total = allRounds.length;

  let ri = 0;
  function accumulateRounds(rounds, pointsTable) {
    rounds.forEach((round) => {
      (round.results || []).forEach((r) => {
        const entry = ensure(r.name, total);
        const pos = r.position;
        const pts = pos >= 1 && pos <= pointsTable.length ? pointsTable[pos - 1] : 0;
        entry.points += pts;
        entry.roundPoints[ri] = pts;
        entry.roundPositions[ri] = pos;
        if (pos === 1) entry.wins += 1;
        if (pos <= 3) entry.podiums += 1;
      });
      ri++;
    });
  }

  accumulateRounds(championship.rounds || [], championship.pointsTable || []);
  for (const div of championship.divisions || []) {
    accumulateRounds(div.rounds || [], div.pointsTable || championship.pointsTable || []);
  }

  const standings = [...map.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.podiums !== a.podiums) return b.podiums - a.podiums;
    return a.name.localeCompare(b.name);
  });

  return standings.map((s, i) => ({ ...s, position: i + 1 }));
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id || generateId(),
    type: ['practice', 'qualifying', 'race', 'ironcut'].includes(raw.type) ? raw.type : 'practice',
    label: raw.label || '',
    startTime: raw.startTime || '',
    durationMinutes: Math.max(1, parseInt(raw.durationMinutes, 10) || 15),
    kartTransporter: Boolean(raw.kartTransporter),
    notes: raw.notes || '',
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
    raceType: raw.raceType || 'sprint',
    sessions: Array.isArray(raw.sessions) ? raw.sessions.map(normalizeSession).filter(Boolean) : [],
    divisionId: raw.divisionId || null,
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
