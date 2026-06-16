import { parseDriverNames } from './adminHelpers.js';
import { lapToSeconds } from './liveTimingColumns.js';

const GROUP_SEPARATORS = ['|', ':', '—', '–', '-'];

function normalizeNationality(raw) {
  const code = String(raw || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

export function normalizeDriverEntry(raw, index = 0) {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const weightMatch = trimmed.match(/^(.+?)\((\d+(?:\.\d+)?)\s*(?:kg|ק"ג)?\)\s*(\*)?$/i)
      || trimmed.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*kg\s*(\*)?$/i);
    if (weightMatch) {
      return {
        name: weightMatch[1].trim(),
        weightKg: Number(weightMatch[2]),
        starter: Boolean(weightMatch[3]),
        nationality: '',
        transponderId: '',
      };
    }
    const starter = trimmed.endsWith('*');
    return {
      name: (starter ? trimmed.slice(0, -1) : trimmed).trim(),
      weightKg: null,
      starter,
      nationality: '',
      transponderId: '',
    };
  }
  if (!raw || typeof raw !== 'object') {
    return { name: '', weightKg: null, starter: index === 0, nationality: '', transponderId: '' };
  }
  const weightRaw = raw.weightKg;
  const tid = raw.transponderId ?? raw.transponder_id;
  return {
    name: String(raw.name || '').trim(),
    weightKg: weightRaw === '' || weightRaw == null ? null : Math.max(0, Number(weightRaw) || 0),
    starter: Boolean(raw.starter),
    nationality: normalizeNationality(raw.nationality),
    transponderId: tid ? String(tid).trim() : '',
  };
}

export function normalizeGroupDrivers(drivers) {
  const list = (drivers || [])
    .map((d, i) => normalizeDriverEntry(d, i))
    .filter((d) => d.name);
  if (!list.length) return list;
  const starters = list.filter((d) => d.starter);
  if (!starters.length) list[0].starter = true;
  else if (starters.length > 1) {
    let kept = false;
    list.forEach((d) => {
      if (d.starter && !kept) kept = true;
      else d.starter = false;
    });
  }
  return list;
}

export function driverEntryName(entry) {
  return normalizeDriverEntry(entry).name;
}

export function driverDisplayName(entry) {
  const d = normalizeDriverEntry(entry);
  if (d.weightKg != null && d.weightKg > 0) return `${d.name} (${d.weightKg}kg)`;
  return d.name;
}

function splitGroupLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  for (const sep of GROUP_SEPARATORS) {
    const idx = trimmed.indexOf(sep);
    if (idx > 0) {
      const name = trimmed.slice(0, idx).trim();
      const driversPart = trimmed.slice(idx + sep.length).trim();
      const drivers = normalizeGroupDrivers(parseDriverNames(driversPart.replace(/\n/g, ',')));
      if (name && drivers.length) return { name, drivers };
    }
  }

  const drivers = normalizeGroupDrivers(parseDriverNames(trimmed.replace(/\n/g, ',')));
  if (!drivers.length) return null;
  return { name: '', drivers };
}

/** Parse bulk group/team lines for endurance or sprint heats. */
export function parseRaceGroupsText(text, options = {}) {
  const mode = options.mode || 'endurance';
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const groups = [];
  const errors = [];
  let autoHeat = 1;

  lines.forEach((line, lineIndex) => {
    const parsed = splitGroupLine(line);
    if (!parsed) {
      errors.push({ line: lineIndex + 1, message: 'empty_group' });
      return;
    }
    let name = parsed.name;
    if (!name) {
      name = mode === 'sprint' ? `Heat ${autoHeat}` : `Team ${autoHeat}`;
      autoHeat += 1;
    }
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      errors.push({ line: lineIndex + 1, message: 'duplicate_group', name });
      return;
    }
    groups.push({ name, drivers: parsed.drivers });
  });

  return { groups, errors };
}

export function createEmptyTeamRecord(index = 1) {
  return {
    name: '',
    nationality: '',
    transponderId: '',
    members: [{ name: '', weightKg: '', starter: true, nationality: '', transponderId: '' }],
  };
}

function preserveEditableText(value) {
  return String(value ?? '');
}

export function groupsToTeamRecords(groups, options = {}) {
  const preserveRaw = options.preserveRaw !== false;
  const list = Array.isArray(groups) && groups.length ? groups : [createEmptyTeamRecord()];
  return list.map((group) => {
    const rawMembers = (group.drivers || []).map((d, i) => {
      const entry = normalizeDriverEntry(d, i);
      return {
        name: preserveRaw ? preserveEditableText(d?.name ?? entry.name) : entry.name,
        weightKg: entry.weightKg != null ? String(entry.weightKg) : (d?.weightKg === '' ? '' : ''),
        starter: Boolean(entry.starter),
        nationality: entry.nationality || '',
        transponderId: preserveRaw
          ? preserveEditableText(d?.transponderId ?? d?.transponder_id ?? entry.transponderId)
          : entry.transponderId,
      };
    });
    const members = rawMembers.length
      ? rawMembers
      : [{ name: '', weightKg: '', starter: true, nationality: '', transponderId: '' }];
    if (!members.some((m) => m.starter)) members[0].starter = true;
    const teamTid = group.transponderId ?? group.transponder_id;
    return {
      name: preserveRaw ? preserveEditableText(group.name) : String(group.name || '').trim(),
      nationality: normalizeNationality(group.nationality),
      transponderId: preserveRaw ? preserveEditableText(teamTid) : (teamTid ? String(teamTid).trim() : ''),
      members,
    };
  });
}

export function sanitizeRaceGroupsForApply(groups) {
  return (groups || [])
    .map((group, index) => {
      const name = String(group.name || '').trim() || `Team ${index + 1}`;
      const nationality = normalizeNationality(group.nationality);
      const teamTid = group.transponderId ?? group.transponder_id;
      const drivers = normalizeGroupDrivers((group.drivers || []).map((d) => ({
        name: String(d?.name || '').trim(),
        weightKg: d?.weightKg,
        starter: d?.starter,
        nationality: d?.nationality,
        transponderId: String(d?.transponderId ?? d?.transponder_id ?? '').trim(),
      })));
      const payload = { name, nationality, drivers };
      const tid = teamTid ? String(teamTid).trim() : '';
      if (tid) payload.transponderId = tid;
      return drivers.length ? payload : null;
    })
    .filter(Boolean);
}

export function teamRecordsToGroups(teams, options = {}) {
  const preserveEmpty = Boolean(options.preserveEmpty);
  const preserveRaw = preserveEmpty || Boolean(options.preserveRaw);
  return (teams || [])
    .map((team, index) => {
      const rawName = preserveRaw ? preserveEditableText(team.name) : String(team.name || '').trim();
      const name = rawName || (preserveEmpty ? '' : `Team ${index + 1}`);
      const nationality = normalizeNationality(team.nationality);
      const teamTid = team.transponderId ?? team.transponder_id;
      const rawDrivers = (team.members || []).map((m) => ({
        name: preserveRaw ? preserveEditableText(m.name) : String(m.name || '').trim(),
        weightKg: m.weightKg === '' || m.weightKg == null ? null : Number(m.weightKg),
        starter: Boolean(m.starter),
        nationality: normalizeNationality(m.nationality),
        transponderId: preserveRaw
          ? preserveEditableText(m.transponderId ?? m.transponder_id)
          : String(m.transponderId ?? m.transponder_id ?? '').trim(),
      }));

      if (preserveEmpty) {
        const members = rawDrivers.length
          ? rawDrivers
          : [{ name: '', weightKg: null, starter: true, nationality: '', transponderId: '' }];
        if (!members.some((d) => d.starter)) members[0].starter = true;
        const out = { name, nationality, drivers: members };
        const tid = preserveRaw ? preserveEditableText(teamTid) : (teamTid ? String(teamTid).trim() : '');
        if (tid) out.transponderId = tid;
        return out;
      }

      const drivers = normalizeGroupDrivers(rawDrivers);
      if (!drivers.length) return null;
      const out = { name: name || `Team ${index + 1}`, nationality, drivers };
      const tid = teamTid ? String(teamTid).trim() : '';
      if (tid) out.transponderId = tid;
      return out;
    })
    .filter((g) => (preserveEmpty ? true : Boolean(g)));
}

export function groupsToDriverQueue(groups, mode = 'endurance') {
  const queue = [];
  groups.forEach((group) => {
    const team = mode === 'endurance' ? group.name : null;
    normalizeGroupDrivers(group.drivers).forEach((driver) => {
      queue.push({
        name: driver.name,
        team,
        weightKg: driver.weightKg,
        transponderId: driver.transponderId || null,
        phone: null,
        email: null,
        level: null,
        saved: false,
      });
    });
  });
  return queue;
}

export function collectTransponderIdsFromGroups(groups) {
  const ids = [];
  (groups || []).forEach((group) => {
    const teamTid = group.transponderId ?? group.transponder_id;
    if (teamTid) ids.push(String(teamTid).trim());
    normalizeGroupDrivers(group.drivers).forEach((d) => {
      if (d.transponderId) ids.push(String(d.transponderId).trim());
    });
  });
  return [...new Set(ids.filter(Boolean))];
}

export function buildTeamStartersFromGroups(groups) {
  const starters = {};
  (groups || []).forEach((group) => {
    const drivers = normalizeGroupDrivers(group.drivers);
    const starter = drivers.find((d) => d.starter) || drivers[0];
    if (starter) starters[group.name] = starter.name;
  });
  return starters;
}

/** Comma-separated drivers line for endurance one-row editor. */
export function serializeTeamDriversLine(members) {
  return (members || [])
    .filter((m) => m?.name?.trim())
    .map((m) => {
      let part = String(m.name).trim();
      if (m.weightKg !== '' && m.weightKg != null) part += `(${m.weightKg}kg)`;
      if (m.starter) part += '*';
      return part;
    })
    .join(', ');
}

export function parseTeamDriversLine(text) {
  const parts = String(text || '').split(',').map((s) => s); // preserve spaces while typing
  const nonEmpty = parts.filter((p) => p.trim());
  if (!nonEmpty.length) {
    return [{ name: '', weightKg: '', starter: true, nationality: '', transponderId: '' }];
  }
  return parts
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const entry = normalizeDriverEntry(trimmed);
      // Use the parsed clean name (not the raw string) to avoid weight duplication
      // when serializeTeamDriversLine runs on the result.
      return {
        name: entry.name,
        weightKg: entry.weightKg != null ? String(entry.weightKg) : '',
        starter: Boolean(entry.starter),
        nationality: entry.nationality || '',
        transponderId: entry.transponderId || '',
      };
    })
    .filter(Boolean);
}

export function serializeGroupsText(groups) {
  return (groups || [])
    .map((g) => {
      const drivers = normalizeGroupDrivers(g.drivers).map((d) => {
        let part = d.name;
        if (d.weightKg != null && d.weightKg > 0) part += `(${d.weightKg})`;
        if (d.starter) part += '*';
        return part;
      });
      return `${g.name} | ${drivers.join(', ')}`;
    })
    .join('\n');
}

/** Parse "Yossi*, Dan (75), Mike" into driver entries. */
export function parseDriversLine(text) {
  return normalizeGroupDrivers(parseDriverNames(String(text || '')));
}

export function formatDriversLine(drivers) {
  return normalizeGroupDrivers(drivers).map((d) => {
    let part = d.name;
    if (d.weightKg != null && d.weightKg > 0) part += `(${d.weightKg})`;
    if (d.starter) part += '*';
    return part;
  }).join(', ');
}

function splitCsvRow(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if ((ch === ',' || ch === ';') && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function normalizeCsvHeader(cell) {
  const raw = String(cell || '').trim().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u0590-\u05ff]/g, '');
  // Hebrew aliases
  const map = {
    'קבוצה': 'team',
    'מקצה': 'heat',
    'נהג': 'driver',
    'נהגים': 'drivers',
    'משקל': 'weight',
    'מזנק': 'starter',
    'לאום': 'nationality',
    'מדינה': 'nationality',
    'התחלה': 'starter',
    'קג': 'weight',
    'שם_נהג': 'driver',
    'שם_קבוצה': 'team',
    'טרנספונדר': 'transponder',
    'מספר_טרנספונדר': 'transponder',
  };
  return map[raw] || raw;
}

/** Parse CSV for teams/heats: wide (team,driver,weight,starter) or compact (team,drivers). */
export function parseRaceGroupsCsv(text, options = {}) {
  const mode = options.mode || 'endurance';
  const rawLines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const groups = [];
  const errors = [];
  if (!rawLines.length) return { groups, errors };

  const headerCells = splitCsvRow(rawLines[0]).map(normalizeCsvHeader);
  const hasHeader = headerCells.some((h) => (
    h.includes('team') || h.includes('קבוצה') || h.includes('heat') || h.includes('מקצה') || h.includes('driver') || h.includes('נהג')
  ));
  const dataLines = hasHeader ? rawLines.slice(1) : rawLines;
  const headers = hasHeader ? headerCells : [];

  const teamIdx = headers.findIndex((h) => h.includes('team') || h.includes('קבוצה') || h.includes('heat') || h.includes('מקצה'));
  const driversIdx = headers.findIndex((h) => h.includes('drivers') || h.includes('נהגים') || h === 'driver_list');
  const driverIdx = headers.findIndex((h) => h === 'driver' || h.includes('נהג') || h.includes('name'));
  const weightIdx = headers.findIndex((h) => h.includes('weight') || h.includes('משקל') || h === 'kg');
  const starterIdx = headers.findIndex((h) => h.includes('starter') || h.includes('מזנק') || h === 'start');
  const nationalityIdx = headers.findIndex((h) => h.includes('nationality') || h.includes('nation') || h.includes('country') || h.includes('לאום') || h.includes('מדינה'));
  const transponderIdx = headers.findIndex((h) => h.includes('transponder') || h.includes('tran') || h.includes('chip') || h.includes('טרנספונדר'));

  const teamMap = new Map();
  let autoTeam = 1;

  dataLines.forEach((line, lineIndex) => {
    const cells = splitCsvRow(line);
    if (!cells.some(Boolean)) return;

    let teamName = '';
    if (teamIdx >= 0) teamName = cells[teamIdx] || '';
    else if (cells.length >= 2 && driverIdx < 0 && driversIdx < 0) teamName = cells[0];
    else if (cells.length === 1) teamName = '';
    else teamName = cells[0];

    teamName = String(teamName || '').trim();
    if (!teamName) {
      teamName = mode === 'sprint' ? `Heat ${autoTeam}` : `Team ${autoTeam}`;
      autoTeam += 1;
    }

    if (!teamMap.has(teamName)) {
      teamMap.set(teamName, { name: teamName, drivers: [] });
    }
    const group = teamMap.get(teamName);

    if (driversIdx >= 0 && cells[driversIdx]) {
      parseDriversLine(cells[driversIdx]).forEach((d) => group.drivers.push(d));
      return;
    }

    if (driverIdx >= 0 && cells[driverIdx]) {
      const name = cells[driverIdx].trim();
      const weightRaw = weightIdx >= 0 ? cells[weightIdx] : '';
      const starterRaw = starterIdx >= 0 ? cells[starterIdx] : '';
      const nationalityRaw = nationalityIdx >= 0 ? cells[nationalityIdx] : '';
      const transponderRaw = transponderIdx >= 0 ? cells[transponderIdx] : '';
      const starter = /^(1|true|yes|y|★|\*|כן)$/i.test(String(starterRaw).trim()) || name.endsWith('*');
      group.drivers.push({
        name: name.replace(/\*$/, '').trim(),
        weightKg: weightRaw === '' ? null : Math.max(0, Number(weightRaw) || 0),
        starter,
        nationality: nationalityRaw,
        transponderId: String(transponderRaw || '').trim(),
      });
      return;
    }

    if (cells.length >= 2) {
      parseDriversLine(cells.slice(1).join(',')).forEach((d) => group.drivers.push(d));
      return;
    }

    const parsed = splitGroupLine(line);
    if (parsed) {
      if (teamMap.has(parsed.name) && parsed.name) {
        parsed.drivers.forEach((d) => teamMap.get(parsed.name).drivers.push(d));
      } else {
        teamMap.set(parsed.name || teamName, { name: parsed.name || teamName, drivers: parsed.drivers });
      }
      return;
    }

    errors.push({ line: lineIndex + 1, message: 'bad_csv_row' });
  });

  teamMap.forEach((group) => {
    group.drivers = normalizeGroupDrivers(group.drivers);
    if (!group.drivers.length) return;
    const shared = group.drivers[0].nationality;
    if (shared && group.drivers.every((d) => d.nationality === shared)) group.nationality = shared;
    groups.push(group);
  });

  return { groups, errors };
}

export function buildRaceSchedulePreview(event) {
  const normalized = normalizePlannedRaceEvent({
    ...event,
    groups: event?.groups || [],
  });
  if (!normalized?.groups?.length) return [];

  if (normalized.type === 'sprint') {
    const sessions = buildSessionsFromGroups(normalized.groups);
    return sessions.map((session, index) => ({
      order: index + 1,
      title: session.name,
      drivers: session.drivers,
      note: index < sessions.length - 1
        ? { turnoverSec: normalized.turnoverSec }
        : null,
    }));
  }

  const durationLabel = [
    normalized.enduranceHours > 0 ? `${normalized.enduranceHours}h` : '',
    normalized.enduranceMinutes > 0 ? `${normalized.enduranceMinutes}m` : '',
  ].filter(Boolean).join(' ') || null;

  return normalized.groups.map((group, index) => {
    const drivers = normalizeGroupDrivers(group.drivers);
    return {
      order: index + 1,
      title: group.name,
      drivers: drivers.map((d) => ({
        name: driverDisplayName(d),
        starter: Boolean(d.starter),
      })),
      note: null,
      // Duration meta surfaced at the schedule header level, not per-group
      _durationMeta: index === 0 && durationLabel
        ? { duration: durationLabel, stintMin: normalized.stintMinutes }
        : null,
    };
  });
}

export function raceGroupsCsvTemplate(mode = 'endurance') {
  if (mode === 'sprint') {
    return 'heat,drivers\nHeat 1,"Yossi*, Dani, Mike, Sara"\nHeat 2,"Oren, Noa, Gil"';
  }
  return 'team,driver,weight,starter,nationality,transponder\nTeam Alpha,Yossi Cohen,75,1,IL,12345678\nTeam Alpha,Dani Levi,80,0,GB,\nTeam Beta,Sara Gold,65,1,IL,87654321';
}

export function createEmptyRaceEvent(type = 'endurance') {
  return {
    type,
    name: '',
    defaultNationality: '',
    groupsText: '',
    groups: [],
    activeSessionIndex: 0,
    sessions: [],
    enduranceHours: 1,
    enduranceMinutes: 0,
    stintMinutes: 45,
    driverChangeSec: 90,
    targetLaps: 12,
    formationLaps: 0,
    startMode: 'grid',
    turnoverSec: 120,
    enduranceRules: '',
    advanceCount: 2,
    round: 1,
    roundHistory: [],
    heatNumbers: [],
    timingSystem: 'mylaps_tranx',
    updatedAt: Date.now(),
  };
}

export function normalizePlannedRaceEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'sprint' ? 'sprint' : 'endurance';
  const base = createEmptyRaceEvent(type);
  const groups = Array.isArray(raw.groups) ? sanitizeRaceGroupsForApply(raw.groups) : [];

  return {
    ...base,
    ...raw,
    type,
    name: String(raw.name || '').trim(),
    defaultNationality: normalizeNationality(raw.defaultNationality),
    timingSystem: raw.timingSystem || 'mylaps_tranx',
    groupsText: raw.groupsText || serializeGroupsText(groups),
    groups,
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    activeSessionIndex: Math.max(0, Number(raw.activeSessionIndex) || 0),
    enduranceHours: Math.max(0, Number(raw.enduranceHours) || 0),
    enduranceMinutes: Math.max(0, Math.min(59, Number(raw.enduranceMinutes) || 0)),
    stintMinutes: raw.stintMinutes != null ? Math.max(0, Number(raw.stintMinutes) || 0) : 45,
    driverChangeSec: raw.driverChangeSec != null ? Math.max(0, Number(raw.driverChangeSec) || 0) : 90,
    targetLaps: Math.max(1, Number(raw.targetLaps) || 12),
    formationLaps: Math.max(0, Number(raw.formationLaps) || 0),
    startMode: raw.startMode === 'le_mans' ? 'le_mans' : 'grid',
    turnoverSec: Math.max(0, Number(raw.turnoverSec) || 120),
    enduranceRules: String(raw.enduranceRules || ''),
    advanceCount: Math.max(1, Number(raw.advanceCount) || 2),
    round: Math.max(1, Number(raw.round) || 1),
    roundHistory: Array.isArray(raw.roundHistory) ? raw.roundHistory : [],
    heatNumbers: Array.isArray(raw.heatNumbers) ? raw.heatNumbers.map((n) => Number(n)).filter((n) => !Number.isNaN(n)) : [],
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function buildSessionsFromGroups(groups) {
  return (groups || []).map((g, i) => ({
    index: i,
    name: g.name,
    drivers: normalizeGroupDrivers(g.drivers).map((d) => d.name),
  }));
}

/** Sort a finished heat's results the way a sprint classification is decided: most laps, then best lap time. */
function sortSprintResults(results) {
  return [...(results || [])].sort((a, b) => {
    const lapDiff = (b.lap_count || 0) - (a.lap_count || 0);
    if (lapDiff !== 0) return lapDiff;
    return lapToSeconds(a.best_lap_time) - lapToSeconds(b.best_lap_time);
  });
}

const ROUND_NAMES = {
  2: 'admin_pro_event_round_semifinal',
  3: 'admin_pro_event_round_final',
};

/** Label for the Nth round of a sprint progression (heats -> semifinal -> final). */
export function sprintRoundLabelKey(round) {
  return ROUND_NAMES[round] || 'admin_pro_event_round_n';
}

/**
 * Build the next round's groups from the current round's heat results.
 * Takes the top `advanceCount` finishers from each heat (in classification
 * order) and combines them into a single group for the next round - mirrors
 * how karting/F1-style sprint formats funnel heats into a semifinal/final.
 *
 * `resultsByHeat` maps heat_number -> results array (as stored in heatHistory).
 * `roundName` is the already-translated display name for the new group (e.g. "Semifinal").
 */
export function buildAdvancementGroups(sessions, heatNumbers, resultsByHeat, advanceCount, roundName) {
  const qualifiers = [];
  (sessions || []).forEach((session, i) => {
    const heatNumber = heatNumbers?.[i];
    const results = resultsByHeat?.[heatNumber];
    if (!results?.length) return;
    sortSprintResults(results)
      .slice(0, Math.max(1, Number(advanceCount) || 1))
      .forEach((r) => {
        qualifiers.push({ name: r.driver_name, weightKg: null, starter: false });
      });
  });
  if (!qualifiers.length) return [];
  qualifiers[0].starter = true;
  return [{ name: roundName, drivers: qualifiers }];
}

export function appendStintRulesToEnduranceRules(rules, stintMinutes, driverChangeSec) {
  const base = String(rules || '').trim();
  const lines = [];
  if (Number(stintMinutes) > 0) lines.push(`Stint: ${stintMinutes} min`);
  if (Number(driverChangeSec) > 0) lines.push(`Driver change target: ${driverChangeSec}s`);
  if (!lines.length) return base;
  const suffix = lines.join(' · ');
  if (!base) return suffix;
  if (base.includes('Driver change target:') || base.includes('Stint:')) return base;
  return `${base}\n${suffix}`;
}

export function summarizeRaceEvent(event) {
  const normalized = normalizePlannedRaceEvent(event);
  if (!normalized) return null;
  const teamCount = normalized.groups.length;
  const driverCount = normalized.groups.reduce(
    (sum, g) => sum + normalizeGroupDrivers(g.drivers).length,
    0,
  );
  const sessionCount = normalized.type === 'sprint' ? teamCount : 1;
  return {
    teamCount,
    driverCount,
    sessionCount,
    stintMinutes: normalized.stintMinutes,
    driverChangeSec: normalized.driverChangeSec,
    turnoverSec: normalized.turnoverSec,
  };
}
