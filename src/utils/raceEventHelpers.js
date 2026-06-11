import { parseDriverNames } from './adminHelpers.js';

const GROUP_SEPARATORS = ['|', ':', '—', '–', '-'];

function splitGroupLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  for (const sep of GROUP_SEPARATORS) {
    const idx = trimmed.indexOf(sep);
    if (idx > 0) {
      const name = trimmed.slice(0, idx).trim();
      const driversPart = trimmed.slice(idx + sep.length).trim();
      const drivers = parseDriverNames(driversPart.replace(/\n/g, ','));
      if (name && drivers.length) return { name, drivers };
    }
  }

  const drivers = parseDriverNames(trimmed.replace(/\n/g, ','));
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

export function groupsToDriverQueue(groups, mode = 'endurance') {
  const queue = [];
  groups.forEach((group) => {
    const team = mode === 'endurance' ? group.name : null;
    group.drivers.forEach((name) => {
      queue.push({
        name,
        team,
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
  groups.forEach((group) => {
    if (group.drivers[0]) starters[group.name] = group.drivers[0];
  });
  return starters;
}

export function serializeGroupsText(groups) {
  return (groups || [])
    .map((g) => `${g.name} | ${(g.drivers || []).join(', ')}`)
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
      drivers: Array.isArray(g.drivers) ? g.drivers.map((d) => String(d).trim()).filter(Boolean) : [],
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
    stintMinutes: Math.max(1, Number(raw.stintMinutes) || 45),
    driverChangeSec: Math.max(15, Number(raw.driverChangeSec) || 90),
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
    drivers: [...g.drivers],
  }));
}

export function appendStintRulesToEnduranceRules(rules, stintMinutes, driverChangeSec) {
  const base = String(rules || '').trim();
  const stintLine = `Stint: ${stintMinutes} min · Driver change target: ${driverChangeSec}s`;
  if (!base) return stintLine;
  if (base.includes('Driver change target:')) return base;
  return `${base}\n${stintLine}`;
}

export function summarizeRaceEvent(event) {
  const normalized = normalizePlannedRaceEvent(event);
  if (!normalized) return null;
  const teamCount = normalized.groups.length;
  const driverCount = normalized.groups.reduce((sum, g) => sum + g.drivers.length, 0);
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
