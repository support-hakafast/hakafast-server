import { parseDriverNames } from './adminHelpers.js';

const GROUP_SEPARATORS = ['|', ':', '—', '–', '-'];

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
      };
    }
    const starter = trimmed.endsWith('*');
    return {
      name: (starter ? trimmed.slice(0, -1) : trimmed).trim(),
      weightKg: null,
      starter,
    };
  }
  if (!raw || typeof raw !== 'object') {
    return { name: '', weightKg: null, starter: index === 0 };
  }
  const weightRaw = raw.weightKg;
  return {
    name: String(raw.name || '').trim(),
    weightKg: weightRaw === '' || weightRaw == null ? null : Math.max(0, Number(weightRaw) || 0),
    starter: Boolean(raw.starter),
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
    members: [{ name: '', weightKg: '', starter: true }],
  };
}

export function groupsToTeamRecords(groups) {
  const list = Array.isArray(groups) && groups.length ? groups : [createEmptyTeamRecord()];
  return list.map((group, index) => {
    const drivers = normalizeGroupDrivers(group.drivers);
    return {
      name: String(group.name || '').trim() || '',
      members: drivers.length
        ? drivers.map((d) => ({
          name: d.name,
          weightKg: d.weightKg != null ? String(d.weightKg) : '',
          starter: Boolean(d.starter),
        }))
        : [{ name: '', weightKg: '', starter: true }],
    };
  });
}

export function teamRecordsToGroups(teams) {
  return (teams || [])
    .map((team, index) => {
      const name = String(team.name || '').trim() || `Team ${index + 1}`;
      const drivers = normalizeGroupDrivers(
        (team.members || []).map((m) => ({
          name: String(m.name || '').trim(),
          weightKg: m.weightKg === '' || m.weightKg == null ? null : Number(m.weightKg),
          starter: Boolean(m.starter),
        })),
      );
      return drivers.length ? { name, drivers } : null;
    })
    .filter(Boolean);
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
        phone: null,
        email: null,
        level: null,
        saved: false,
      });
    });
  });
  return queue;
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

export function createEmptyRaceEvent(type = 'endurance') {
  return {
    type,
    name: '',
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
    updatedAt: Date.now(),
  };
}

export function normalizePlannedRaceEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'sprint' ? 'sprint' : 'endurance';
  const base = createEmptyRaceEvent(type);
  const groups = Array.isArray(raw.groups)
    ? raw.groups.map((g) => ({
      name: String(g.name || '').trim(),
      drivers: normalizeGroupDrivers(g.drivers),
    })).filter((g) => g.name && g.drivers.length)
    : [];

  return {
    ...base,
    ...raw,
    type,
    name: String(raw.name || '').trim(),
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
