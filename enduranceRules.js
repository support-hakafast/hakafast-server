/**
 * Parses free-text endurance rules and applies automatic penalties during the race.
 *
 * Supported lines (key=value, one per line):
 *   min_driver_changes=2
 *   min_pit_stops=2
 *   max_stint_min=45
 *   violation_penalty_sec=60
 *
 * Hebrew hints are also recognized, e.g. "חובה 2 החלפות נהג".
 */

const RULE_LINE = /^([a-z_]+)\s*[=:]\s*(\d+(?:\.\d+)?)\s*$/i;

const KEY_ALIASES = {
  min_driver_changes: 'minDriverChanges',
  min_driver_change: 'minDriverChanges',
  min_pit_stops: 'minPitStops',
  min_pit_stop: 'minPitStops',
  max_stint_min: 'maxStintMin',
  max_stint_minutes: 'maxStintMin',
  violation_penalty_sec: 'violationPenaltySec',
  penalty_sec: 'violationPenaltySec',
};

function defaultRules() {
  return {
    minDriverChanges: 0,
    minPitStops: 0,
    maxStintMin: 0,
    violationPenaltySec: 60,
  };
}

function parseEnduranceRules(text) {
  const rules = defaultRules();
  if (!text || typeof text !== 'string') return rules;

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;

    const kv = line.match(RULE_LINE);
    if (kv) {
      const key = KEY_ALIASES[kv[1].toLowerCase()];
      if (key) rules[key] = Number(kv[2]) || 0;
      return;
    }

    const driverChangeHe = line.match(/חוב[^\d]*(\d+)[^\n]*(?:החלפ|החלפת)[^\n]*(?:נהג|נהגים)/i);
    if (driverChangeHe) {
      rules.minDriverChanges = Number(driverChangeHe[1]) || rules.minDriverChanges;
    }

    const pitHe = line.match(/חוב[^\d]*(\d+)[^\n]*(?:עציר|ביקור)[^\n]*(?:פיט|פיטים)/i);
    if (pitHe) {
      rules.minPitStops = Number(pitHe[1]) || rules.minPitStops;
    }

    const penaltyHe = line.match(/(?:עונש|קנס)[^\d]*(\d+)\s*(?:שנ|sec)/i);
    if (penaltyHe) {
      rules.violationPenaltySec = Number(penaltyHe[1]) || rules.violationPenaltySec;
    }
  });

  return rules;
}

function hasAutoPenalty(row, code) {
  return (row.penalties || []).some((p) => String(p.reason || '').startsWith(`auto:${code}`));
}

function applyAutoPenalty(row, code, seconds, detail) {
  if (hasAutoPenalty(row, code)) return false;
  const sec = Math.max(1, Number(seconds) || 60);
  if (!Array.isArray(row.penalties)) row.penalties = [];
  row.penalties.push({
    seconds: sec,
    reason: `auto:${code}${detail ? `:${detail}` : ''}`,
    created_at: new Date().toISOString(),
    served_sec: 0,
  });
  row.unserved_penalty_sec = (row.unserved_penalty_sec || 0) + sec;
  return true;
}

function countDriverChanges(row) {
  if (typeof row.driver_swap_count === 'number') return row.driver_swap_count;
  const names = new Set();
  (row.stints || []).forEach((s) => { if (s.driver_name) names.add(s.driver_name); });
  if (row.active_driver) names.add(row.active_driver);
  return Math.max(0, names.size - 1);
}

function getRaceProgress(store) {
  const durationMin = Number(store.heatSettings?.duration) || 0;
  if (!durationMin || !store.heatRuntime?.startedAt) return 0;
  const elapsedSec = (Date.now() - store.heatRuntime.startedAt) / 1000;
  return Math.min(1, elapsedSec / (durationMin * 60));
}

function getCurrentStintMin(row, ot) {
  if (!row?.current_stint?.started_at) return 0;
  const end = ot ? Date.now() : Date.now();
  return (end - row.current_stint.started_at) / 60000;
}

function evaluateRowRules(store, row, { final = false } = {}) {
  const rules = parseEnduranceRules(store.heatSettings?.enduranceRules);
  const hasRules = rules.minDriverChanges > 0
    || rules.minPitStops > 0
    || rules.maxStintMin > 0;
  if (!hasRules) return [];

  const applied = [];
  const progress = getRaceProgress(store);
  const ot = store.onTrack.find((k) => Number(k.kart_number) === Number(row.kart_number));
  const penaltySec = rules.violationPenaltySec || 60;

  if (rules.maxStintMin > 0 && ot) {
    const stintMin = getCurrentStintMin(row, ot);
    if (stintMin > rules.maxStintMin) {
      if (applyAutoPenalty(row, 'max_stint', penaltySec, `${Math.round(stintMin)}min`)) {
        applied.push('max_stint');
      }
    }
  }

  const checkMinimums = final || progress >= 0.85;

  if (checkMinimums && rules.minDriverChanges > 0) {
    const changes = countDriverChanges(row);
    if (changes < rules.minDriverChanges) {
      if (applyAutoPenalty(row, 'min_driver_changes', penaltySec, `${changes}/${rules.minDriverChanges}`)) {
        applied.push('min_driver_changes');
      }
    }
  }

  if (checkMinimums && rules.minPitStops > 0) {
    const pits = row.pit_visits || 0;
    if (pits < rules.minPitStops) {
      if (applyAutoPenalty(row, 'min_pit_stops', penaltySec, `${pits}/${rules.minPitStops}`)) {
        applied.push('min_pit_stops');
      }
    }
  }

  return applied;
}

function tickEnduranceRules(store, { final = false } = {}) {
  if (store.heatSettings?.type !== 'endurance') return [];
  const allApplied = [];
  store.currentHeat.forEach((row) => {
    const applied = evaluateRowRules(store, row, { final });
    allApplied.push(...applied.map((code) => ({ kart_number: row.kart_number, code })));
  });
  return allApplied;
}

module.exports = {
  parseEnduranceRules,
  tickEnduranceRules,
  countDriverChanges,
  hasAutoPenalty,
};
