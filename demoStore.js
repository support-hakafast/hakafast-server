const {
  computeAvgLapFromTimes,
  assignHeatNumber,
  getCurrentHeatNumber,
  recordLapStat,
  getTopLaps,
  formatDurationSec,
  lapToSeconds: statsLapToSeconds,
  formatLap: statsFormatLap,
} = require('./lapStats');
const persistentStore = require('./persistentStore');
const installConfig = require('./installConfig');
const enduranceRules = require('./enduranceRules');
const trackProfile = require('./trackProfile');

const stores = new Map();
const persistTimers = new Map();
const TTL_MS = installConfig.isLocalInstall() ? 365 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
const DEFAULT_AVG_LAP_SEC = 45;

function sanitizePitLines(pitLines) {
  if (!pitLines) return pitLines;
  const seen = new Set();
  const next = {};
  Object.entries(pitLines).forEach(([laneId, lane]) => {
    const karts = [];
    (lane.karts || []).forEach((num) => {
      const n = Number(num);
      if (Number.isNaN(n) || seen.has(n)) return;
      seen.add(n);
      karts.push(n);
    });
    next[laneId] = { ...lane, karts };
  });
  return next;
}

function defaultPitLines() {
  return {
    1: { name: 'טור 1', active: true, karts: [] },
    2: { name: 'טור 2', active: true, karts: [] },
  };
}

function createStore(trackSlug = 'kart-demo') {
  return {
    trackSlug,
    createdAt: Date.now(),
    lastAccess: Date.now(),
    pitLines: defaultPitLines(),
    heatSettings: {
      type: 'time',
      duration: 10,
      targetLaps: 0,
      formationLaps: 0,
      startMode: 'grid',
      exportCsv: true,
      exportPdf: false,
      enduranceRules: '',
      timingColumns: { laps: true, second_best: false, avg_lap: false, level: false, gap: true },
    },
    heatRuntime: { startedAt: null, avgLapSec: DEFAULT_AVG_LAP_SEC },
    onTrack: [],
    levelSettings: {
      editPassword: '',
      masterLapThreshold: '45.500',
      proLapThreshold: '42.000',
      pitExitPosition: 'bottom',
    },
    trackSetup: null,
    trackProfile: null,
    driverQueue: [],
    currentHeat: [],
    drivers: [],
    heatHistory: [],
    clientSnapshot: null,
    nextHeat: [],
    nextHeatSettings: null,
    transponderMap: {},
    teamTransponderMap: {},
    heatFrozen: false,
    heatCooldownPhase: false,
    heatRacingStarted: false,
    heatAutoFinishTriggered: false,
    autoFinishExportPending: false,
    autoFinishStartedAt: null,
    autoFinishHeatNumber: null,
    dailyHeat: { date: null, counter: 0, current: null },
    lapRecords: [],
  };
}

function validateWorkspaceId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(id);
}

function validateTrackSlug(track) {
  return typeof track === 'string' && /^[a-z0-9-]{2,48}$/.test(track);
}

function storeKey(trackSlug, workspaceId) {
  return `${trackSlug}:${workspaceId}`;
}

function getStore(trackSlug, workspaceId) {
  if (!validateWorkspaceId(workspaceId) || !validateTrackSlug(trackSlug)) return null;
  const key = storeKey(trackSlug, workspaceId);
  if (!stores.has(key)) {
    const snapshot = persistentStore.loadWorkspaceSnapshot(trackSlug, workspaceId);
    const store = createStore(trackSlug);
    if (snapshot) applySnapshot(store, snapshot);
    stores.set(key, store);
  }
  const store = stores.get(key);
  store.lastAccess = Date.now();
  return store;
}

function persistStore(store) {
  if (!store?.trackSlug) return;
  const workspaceId = store.workspaceId;
  if (!workspaceId || !validateWorkspaceId(workspaceId)) return;
  const snapshot = exportSnapshot(store);
  snapshot.workspaceId = workspaceId;
  persistentStore.saveWorkspaceSnapshot(store.trackSlug, workspaceId, snapshot);
}

function schedulePersist(store) {
  if (!store) return;
  const key = storeKey(store.trackSlug, store.workspaceId || 'pending');
  if (persistTimers.has(key)) return;
  persistTimers.set(key, setTimeout(() => {
    persistTimers.delete(key);
    persistStore(store);
  }, 400));
}

function resolveWorkspace(req) {
  const install = installConfig.loadInstallConfig();
  if (installConfig.isLocalInstall() && install?.workspaceId) {
    const track = req.headers['x-hf-track'] || install.trackSlug || process.env.HF_TRACK_SLUG || 'kart-demo';
    const store = getStore(track, install.workspaceId);
    if (store) store.workspaceId = install.workspaceId;
    return store;
  }
  const id = req.headers['x-hf-workspace'];
  const track = req.headers['x-hf-track'] || 'kart-demo';
  if (!id) return null;
  const store = getStore(track, id);
  if (store) store.workspaceId = id;
  return store;
}

function resolveFromParts(trackSlug, workspaceId) {
  if (!workspaceId) return null;
  const store = getStore(trackSlug || 'kart-demo', workspaceId);
  if (store) store.workspaceId = workspaceId;
  return store;
}

function resetStore(trackSlug, workspaceId) {
  const key = storeKey(trackSlug, workspaceId);
  stores.delete(key);
  persistentStore.deleteWorkspaceSnapshot(trackSlug, workspaceId);
  const store = getStore(trackSlug, workspaceId);
  if (store) store.workspaceId = workspaceId;
  return store;
}

function exportSnapshot(store) {
  if (!store) return null;
  return {
    trackSlug: store.trackSlug,
    workspaceId: store.workspaceId || null,
    pitLines: store.pitLines,
    heatSettings: store.heatSettings,
    heatRuntime: store.heatRuntime,
    onTrack: store.onTrack,
    levelSettings: store.levelSettings,
    trackSetup: store.trackSetup,
    trackProfile: store.trackProfile,
    driverQueue: store.driverQueue,
    currentHeat: store.currentHeat,
    nextHeat: store.nextHeat,
    nextHeatSettings: store.nextHeatSettings,
    drivers: store.drivers,
    clientSnapshot: store.clientSnapshot,
    transponderMap: store.transponderMap,
    teamTransponderMap: store.teamTransponderMap,
    heatFrozen: store.heatFrozen,
    heatCooldownPhase: store.heatCooldownPhase,
    heatRacingStarted: store.heatRacingStarted,
    heatAutoFinishTriggered: store.heatAutoFinishTriggered,
    autoFinishExportPending: store.autoFinishExportPending,
    autoFinishStartedAt: store.autoFinishStartedAt,
    autoFinishHeatNumber: store.autoFinishHeatNumber,
    heatHistory: store.heatHistory,
    dailyHeat: store.dailyHeat,
    lapRecords: store.lapRecords,
    exportedAt: Date.now(),
  };
}

function applySnapshot(store, snapshot) {
  if (!store || !snapshot) return;
  if (snapshot.pitLines) store.pitLines = snapshot.pitLines;
  if (snapshot.heatSettings) store.heatSettings = snapshot.heatSettings;
  if (snapshot.heatRuntime) store.heatRuntime = snapshot.heatRuntime;
  if (snapshot.onTrack) store.onTrack = snapshot.onTrack;
  if (snapshot.levelSettings) store.levelSettings = { ...store.levelSettings, ...snapshot.levelSettings };
  if (snapshot.trackSetup) store.trackSetup = snapshot.trackSetup;
  if (snapshot.trackProfile) store.trackProfile = trackProfile.normalizeTrackProfile(snapshot.trackProfile, store.trackSlug);
  if (snapshot.driverQueue) store.driverQueue = snapshot.driverQueue;
  if (snapshot.currentHeat) store.currentHeat = snapshot.currentHeat;
  if (snapshot.nextHeat) store.nextHeat = snapshot.nextHeat;
  if (snapshot.nextHeatSettings) store.nextHeatSettings = snapshot.nextHeatSettings;
  if (snapshot.drivers) store.drivers = snapshot.drivers;
  if (snapshot.clientSnapshot) store.clientSnapshot = snapshot.clientSnapshot;
  if (snapshot.transponderMap) store.transponderMap = snapshot.transponderMap;
  if (snapshot.teamTransponderMap) store.teamTransponderMap = snapshot.teamTransponderMap;
  if (typeof snapshot.heatFrozen === 'boolean') store.heatFrozen = snapshot.heatFrozen;
  if (typeof snapshot.heatCooldownPhase === 'boolean') store.heatCooldownPhase = snapshot.heatCooldownPhase;
  if (typeof snapshot.heatRacingStarted === 'boolean') store.heatRacingStarted = snapshot.heatRacingStarted;
  if (typeof snapshot.heatAutoFinishTriggered === 'boolean') store.heatAutoFinishTriggered = snapshot.heatAutoFinishTriggered;
  if (typeof snapshot.autoFinishExportPending === 'boolean') store.autoFinishExportPending = snapshot.autoFinishExportPending;
  if (snapshot.autoFinishStartedAt !== undefined) store.autoFinishStartedAt = snapshot.autoFinishStartedAt;
  if (snapshot.autoFinishHeatNumber !== undefined) store.autoFinishHeatNumber = snapshot.autoFinishHeatNumber;
  if (Array.isArray(snapshot.heatHistory)) store.heatHistory = snapshot.heatHistory;
  if (snapshot.dailyHeat) store.dailyHeat = snapshot.dailyHeat;
  if (snapshot.lapRecords) store.lapRecords = snapshot.lapRecords;
  if (snapshot.workspaceId) store.workspaceId = snapshot.workspaceId;
  store.lastAccess = Date.now();
}

function pruneStores() {
  const now = Date.now();
  for (const [key, store] of stores) {
    if (now - store.lastAccess > TTL_MS) stores.delete(key);
  }
}

setInterval(pruneStores, 60 * 60 * 1000);

function lapToSeconds(lap) {
  if (!lap || typeof lap !== 'string') return Infinity;
  const trimmed = lap.trim();
  if (trimmed.includes(':')) {
    const [mins, secs] = trimmed.split(':');
    return (parseInt(mins, 10) || 0) * 60 + (parseFloat(secs) || 0);
  }
  const value = parseFloat(trimmed);
  return Number.isNaN(value) ? Infinity : value;
}

function formatLap(seconds) {
  return Math.max(0, seconds).toFixed(3);
}

function getAvgLapSec(store) {
  return store.heatRuntime?.avgLapSec || DEFAULT_AVG_LAP_SEC;
}

const LEVEL_RANK = { Amateur: 0, Master: 1, Pro: 2 };

function levelFromBestLap(store, bestLap, fallback = 'Amateur') {
  const bestSec = lapToSeconds(bestLap);
  if (bestSec === Infinity) return fallback;
  const proSec = lapToSeconds(store.levelSettings.proLapThreshold);
  const masterSec = lapToSeconds(store.levelSettings.masterLapThreshold);
  if (bestSec <= proSec) return 'Pro';
  if (bestSec <= masterSec) return 'Master';
  return 'Amateur';
}

function maxDriverLevel(saved, computed) {
  const savedRank = LEVEL_RANK[saved] ?? 0;
  const computedRank = LEVEL_RANK[computed] ?? 0;
  return savedRank >= computedRank ? saved : computed;
}

function resolveDriverLevel(store, row) {
  const computed = row.best_lap_time
    ? levelFromBestLap(store, row.best_lap_time, 'Amateur')
    : 'Amateur';
  if (row.registered && row.driver_level) {
    return maxDriverLevel(row.driver_level, computed);
  }
  if (row.best_lap_time) return computed;
  if (row.registered && row.driver_level) return row.driver_level;
  return 'Amateur';
}

function getSessionFastestLapSec(store) {
  let best = Infinity;
  store.currentHeat.forEach((row) => {
    (row.lap_times || []).forEach((lap) => {
      const sec = lapToSeconds(lap);
      if (sec < best) best = sec;
    });
  });
  return best;
}

function groupQueueByTeam(queue) {
  const teams = [];
  const map = new Map();
  (queue || []).forEach((d) => {
    const key = (d.team || '').trim() || d.name;
    if (!map.has(key)) {
      const entry = { teamName: key, drivers: [] };
      map.set(key, entry);
      teams.push(entry);
    }
    map.get(key).drivers.push(d);
  });
  return teams;
}

function pickKartsForAssignment(workingLines, laneKeys, driverCount, options = {}) {
  const onTrackKarts = (options.onTrackKarts || [])
    .map((k) => Number(k))
    .filter((n) => !Number.isNaN(n) && n > 0);

  const used = new Set();
  const assigned = [];
  let laneCursor = 0;
  const maxDepth = Math.max(0, ...laneKeys.map((k) => workingLines[k]?.karts?.length || 0));

  for (let i = 0; i < driverCount; i += 1) {
    let found = null;

    for (let depth = 0; depth < maxDepth && !found; depth += 1) {
      for (let offset = 0; offset < laneKeys.length; offset += 1) {
        const key = laneKeys[(laneCursor + offset) % laneKeys.length];
        const kart = workingLines[key]?.karts?.[depth];
        const kartNum = Number(kart);
        if (kart != null && !Number.isNaN(kartNum) && !used.has(kartNum)) {
          found = { kart: kartNum, lane: key, depth, source: 'pit' };
          laneCursor = (laneCursor + offset + 1) % laneKeys.length;
          break;
        }
      }
    }

    if (!found) {
      const trackKart = onTrackKarts.find((n) => !used.has(n));
      if (trackKart != null) {
        found = { kart: trackKart, lane: null, depth: -1, source: 'on_track' };
      }
    }

    if (!found) return { assigned, complete: false };
    used.add(found.kart);
    assigned.push({ ...found, driverIndex: i });
  }
  return { assigned, complete: true };
}

function simulatedBestSec(avgLap, kartNumber) {
  const spread = [3.8, 2.4, 1.2, 0.4, -1.6];
  const tier = Number(kartNumber) % spread.length;
  const jitter = ((Number(kartNumber) * 3) % 7) * 0.08;
  return avgLap - spread[tier] + jitter;
}

/** Realistic per-lap variation for demo simulation (changes every crossing). */
function simulatedLapSecForCrossing(store, ot, row, avgLap) {
  const nextLap = (row.lap_count || 0) + 1;
  const kart = Number(ot.kart_number);
  const base = store.heatSettings?.type === 'endurance'
    ? avgLap
    : simulatedBestSec(avgLap, kart);
  const lapWave = Math.sin(nextLap * 1.31 + kart * 0.47) * 0.72;
  const fatigue = Math.min(0.4, Math.max(0, nextLap - 1) * 0.02);
  const millis = ((kart * 137 + nextLap * 911) % 1000) / 1000;
  return Math.max(1, base + lapWave + fatigue + millis);
}

function withResolvedLevel(store, row) {
  return { ...row, driver_level: resolveDriverLevel(store, row) };
}

function normalizeTeamDrivers(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  return raw.map((d) => {
    if (typeof d === 'string') return { name: d, transponder_id: null };
    return {
      name: d.name || d.driver_name || String(d),
      transponder_id: d.transponder_id ? String(d.transponder_id) : null,
    };
  });
}

function isEnduranceMode(store) {
  return store.heatSettings?.type === 'endurance';
}

function supportsFormationLaps(store) {
  const type = store.heatSettings?.type || 'time';
  return type === 'sprint' || type === 'endurance';
}

function getFormationLapsRequired(store) {
  if (!supportsFormationLaps(store)) return 0;
  return Math.max(0, Number(store.heatSettings?.formationLaps) || 0);
}

function isFormationPhase(store) {
  return getFormationLapsRequired(store) > 0 && !store.heatRacingStarted;
}

function isLeMansStart(store) {
  return isEnduranceMode(store) && (store.heatSettings?.startMode || 'grid') === 'le_mans';
}

function maxFormationLapsDone(store) {
  if (!store.onTrack.length) return 0;
  return store.onTrack.reduce((max, ot) => Math.max(max, ot.formationLapsDone || 0), 0);
}

function allHeatKartsOnTrack(store) {
  if (!store.currentHeat.length) return false;
  const onSet = new Set(store.onTrack.map((ot) => Number(ot.kart_number)));
  return store.currentHeat.every((row) => onSet.has(Number(row.kart_number)));
}

function resetFormationState(store) {
  store.heatRacingStarted = false;
}

function removeKartFromPitLanes(store, kartNumber) {
  const n = Number(kartNumber);
  Object.values(store.pitLines || {}).forEach((lane) => {
    if (!lane?.karts) return;
    lane.karts = lane.karts.filter((k) => Number(k) !== n);
  });
}

function beginRacingPhase(store) {
  if (store.heatRacingStarted) return;
  store.heatRacingStarted = true;
  const now = Date.now();
  store.heatRuntime.startedAt = now;
  store.onTrack.forEach((ot) => {
    ot.launchedAt = now;
    ot.lastLapAt = now;
    ot.trackPosition = 0;
    const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(ot.kart_number));
    ot.lap_count = row?.lap_count || 0;
    ot.simulatedLaps = ot.lap_count;
  });
  if (isEnduranceMode(store)) {
    store.onTrack.forEach((ot) => {
      const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(ot.kart_number));
      if (row && !row.current_stint) {
        startStint(row, row.active_driver || row.driver_name);
      }
    });
  }
}

function tryCompleteFormation(store) {
  if (!isFormationPhase(store)) return;
  const required = getFormationLapsRequired(store);
  if (!required || !store.onTrack.length || !allHeatKartsOnTrack(store)) return;
  const allDone = store.onTrack.every((ot) => (ot.formationLapsDone || 0) >= required);
  if (allDone) beginRacingPhase(store);
}

function recordFormationCrossing(store, ot, row, lapSec, options = {}) {
  const now = options.at ?? Date.now();
  ot.lastLapAt = now;
  ot.formationLapsDone = (ot.formationLapsDone || 0) + 1;
  row.formation_laps_done = ot.formationLapsDone;
  row.last_formation_lap_time = formatLap(lapSec);
  ot.trackPosition = 0;
  tryCompleteFormation(store);
}

function isFormationLapCrossing(store) {
  return isFormationPhase(store);
}

function findHeatRowByKart(store, kartNumber) {
  const n = Number(kartNumber);
  return store.currentHeat.find((r) => Number(r.kart_number) === n)
    || store.nextHeat.find((r) => Number(r.kart_number) === n);
}

function startStint(row, driverName) {
  const now = Date.now();
  row.current_stint = {
    driver_name: driverName,
    started_at: now,
    ended_at: null,
    laps: [],
    lap_count: 0,
    best_lap_time: null,
    avg_lap_time: null,
    duration_sec: 0,
  };
}

function closeStint(row, now = Date.now()) {
  if (!row.current_stint) return;
  row.current_stint.ended_at = now;
  row.current_stint.duration_sec = Math.round((now - row.current_stint.started_at) / 1000);
  if (!Array.isArray(row.stints)) row.stints = [];
  row.stints.push({ ...row.current_stint, laps: [...row.current_stint.laps] });
  row.current_stint = null;
}

function recordStintLap(row, lapSec) {
  if (!row.current_stint) return;
  const lapStr = statsFormatLap(lapSec);
  row.current_stint.laps.push(lapStr);
  row.current_stint.lap_count += 1;
  const bestSec = statsLapToSeconds(row.current_stint.best_lap_time);
  if (bestSec === Infinity || lapSec < bestSec) {
    row.current_stint.best_lap_time = lapStr;
  }
  row.current_stint.avg_lap_time = computeAvgLapFromTimes(row.current_stint.laps);
}

function tickPenaltyService(store) {
  const now = Date.now();
  store.currentHeat.forEach((row) => {
    if (!row.pit_entered_at || !(row.unserved_penalty_sec > 0)) return;
    const pitElapsed = (now - row.pit_entered_at) / 1000;
    const servedSoFar = row.pit_penalty_served_sec || 0;
    const newlyServed = Math.min(row.unserved_penalty_sec, pitElapsed - servedSoFar);
    if (newlyServed > 0) {
      row.unserved_penalty_sec = Math.max(0, row.unserved_penalty_sec - newlyServed);
      row.pit_penalty_served_sec = servedSoFar + newlyServed;
      row.total_penalty_served_sec = (row.total_penalty_served_sec || 0) + newlyServed;
    }
  });
}

function enrichEnduranceTiming(store, row, ot) {
  const now = Date.now();
  tickPenaltyService(store);
  let pit_duration_sec = 0;
  if (row.pit_entered_at && !ot) {
    pit_duration_sec = Math.round((now - row.pit_entered_at) / 1000);
  }
  let stint_duration_sec = 0;
  if (row.current_stint?.started_at && ot) {
    stint_duration_sec = Math.round((now - row.current_stint.started_at) / 1000);
  }
  const currentStint = row.current_stint
    ? {
      driver_name: row.current_stint.driver_name,
      lap_count: row.current_stint.lap_count || 0,
      best_lap_time: row.current_stint.best_lap_time,
      avg_lap_time: row.current_stint.avg_lap_time,
      duration_sec: stint_duration_sec,
      duration_display: formatDurationSec(stint_duration_sec),
    }
    : null;

  const completedStintSec = (row.stints || []).reduce((sum, stint) => sum + (stint.duration_sec || 0), 0);
  const teamSessionSec = completedStintSec + stint_duration_sec;

  return {
    active_driver: row.active_driver || row.driver_name,
    pit_visits: row.pit_visits || 0,
    pit_duration_sec,
    pit_duration_display: pit_duration_sec > 0 ? formatDurationSec(pit_duration_sec) : null,
    total_pit_time_sec: row.total_pit_time_sec || 0,
    total_pit_time_display: formatDurationSec(row.total_pit_time_sec || 0),
    unserved_penalty_sec: row.unserved_penalty_sec || 0,
    penalty_display: row.unserved_penalty_sec > 0 ? `+${formatDurationSec(row.unserved_penalty_sec)}` : null,
    stint_count: (row.stints || []).length,
    current_stint: currentStint,
    team_session_duration_sec: teamSessionSec,
    team_session_display: formatDurationSec(teamSessionSec),
    driver_stint_display: currentStint?.duration_display || formatDurationSec(0),
    stints: (row.stints || []).map((s) => ({
      ...s,
      duration_display: formatDurationSec(s.duration_sec || 0),
    })),
    in_pits: Boolean(row.pit_entered_at && !ot),
  };
}

function recordLapCrossing(store, ot, row, lapSec, options = {}) {
  const now = options.at ?? Date.now();
  ot.lastLapAt = now;

  if (isFormationLapCrossing(store)) {
    recordFormationCrossing(store, ot, row, lapSec, options);
    return;
  }

  if (isCooldownLapCrossing(store, ot, row)) {
    ot.cooldownLapPending = false;
    ot.cooldownLapDone = true;
    row.cooldown_lap_done = true;
    row.last_lap_time = formatLap(lapSec);
    ot.trackPosition = 0;
    ot.lap_count = row.lap_count || 0;
    ot.simulatedLaps = row.lap_count || 0;
    checkAutoFinish(store);
    return;
  }

  row.lap_count = (row.lap_count || 0) + 1;
  row.last_lap_time = formatLap(lapSec);
  if (!Array.isArray(row.lap_times)) row.lap_times = [];
  row.lap_times.push(formatLap(lapSec));

  const currentBest = lapToSeconds(row.best_lap_time);
  if (currentBest === Infinity || lapSec < currentBest) {
    if (currentBest !== Infinity) row.second_best_lap_time = row.best_lap_time;
    row.best_lap_time = formatLap(lapSec);
    row.best_lap_lap_number = row.lap_count;
  } else if (!row.second_best_lap_time || lapSec < lapToSeconds(row.second_best_lap_time)) {
    row.second_best_lap_time = formatLap(lapSec);
  }

  row.avg_lap_time = computeAvgLapFromTimes(row.lap_times);
  row.driver_level = resolveDriverLevel(store, row);

  if (isEnduranceMode(store)) {
    recordStintLap(row, lapSec);
  }

  if (row.lap_count > 1) {
    recordLapStat(store, {
      lap_sec: lapSec,
      driver_name: isEnduranceMode(store) ? (row.active_driver || row.driver_name) : row.driver_name,
      team_name: row.team_name || null,
      stint_driver: row.active_driver || null,
      kart_number: row.kart_number,
      heat_number: getCurrentHeatNumber(store),
      recorded_at: new Date(now).toISOString(),
    });
  }

  ot.lap_count = row.lap_count;
  ot.simulatedLaps = row.lap_count;
}

function tickHeatSimulation(store) {
  if (!store.onTrack.length || store.heatFrozen) return;
  syncHeatCooldownPhase(store);
  if (!store.heatCooldownPhase) {
    if (isTimedHeat(store) && isHeatTimeExpired(store)) return;
    if (isSprintHeat(store) && allSprintTargetLapsReached(store)) return;
  }
  const now = Date.now();
  const avgLap = getAvgLapSec(store);

  store.onTrack.forEach((ot) => {
    const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(ot.kart_number));
    if (!row) return;

    const sinceLapStart = (now - (ot.lastLapAt || ot.launchedAt)) / 1000;
    ot.trackPosition = Math.min(0.999, sinceLapStart / avgLap);

    if (isFormationPhase(store)) {
      const completedFormation = Math.floor((now - ot.launchedAt) / 1000 / avgLap);
      while ((ot.formationLapsDone || 0) < completedFormation) {
        const prevDone = ot.formationLapsDone || 0;
        const lapSec = simulatedLapSecForCrossing(store, ot, row, avgLap);
        const prevAt = ot.lastLapAt || ot.launchedAt;
        const lapAt = Math.min(now, prevAt + lapSec * 1000);
        recordFormationCrossing(store, ot, row, lapSec, { at: lapAt });
        if ((ot.formationLapsDone || 0) === prevDone) break;
      }
    } else if (store.heatCooldownPhase) {
      if (ot.cooldownLapPending && !ot.cooldownLapDone) {
        const sinceLast = (now - (ot.lastLapAt || ot.launchedAt)) / 1000;
        if (sinceLast >= avgLap) {
          const lapSec = simulatedLapSecForCrossing(store, ot, row, avgLap);
          const prevAt = ot.lastLapAt || ot.launchedAt;
          const lapAt = Math.min(now, prevAt + lapSec * 1000);
          recordLapCrossing(store, ot, row, lapSec, { at: lapAt });
        }
      }
    } else {
    const completedLaps = Math.floor((now - ot.launchedAt) / 1000 / avgLap);
    while ((row.lap_count || 0) < completedLaps) {
      const prevCount = row.lap_count || 0;
      const lapSec = simulatedLapSecForCrossing(store, ot, row, avgLap);
      const prevAt = ot.lastLapAt || ot.launchedAt;
      const lapAt = Math.min(now, prevAt + lapSec * 1000);
      recordLapCrossing(store, ot, row, lapSec, { at: lapAt });
      if ((row.lap_count || 0) === prevCount) break;
    }
    }
  });
}

function getHeatDriverCount(store) {
  return store.currentHeat?.length || 0;
}

function getNextHeatKartNumbers(store) {
  return new Set(
    store.nextHeat
      .filter((r) => r.kart_number != null && !Number.isNaN(Number(r.kart_number)))
      .map((r) => Number(r.kart_number)),
  );
}

function countPendingNextHeatKarts(store) {
  return store.nextHeat.filter((r) => r.kart_pending && (r.kart_number == null || Number.isNaN(Number(r.kart_number)))).length;
}

function isKartReservedForNextHeat(store, kartNumber) {
  return getNextHeatKartNumbers(store).has(Number(kartNumber));
}

function allOnTrackAreForNextHeat(store) {
  if (!store.onTrack.length || !store.nextHeat.length) return false;
  const nextSet = getNextHeatKartNumbers(store);
  const pendingCount = countPendingNextHeatKarts(store);

  return store.onTrack.every((ot) => {
    const n = Number(ot.kart_number);
    if (nextSet.has(n)) return true;
    if (pendingCount > 0 && store.currentHeat.some((r) => Number(r.kart_number) === n)) {
      return true;
    }
    return false;
  });
}

function allCooldownLapsComplete(store) {
  if (!store.onTrack.length) return true;
  if (!store.heatCooldownPhase) return false;
  return store.onTrack.every((ot) => ot.cooldownLapDone || !ot.cooldownLapPending);
}

function allOnTrackClearedOrReadyForNextHeatDrain(store) {
  if (store.onTrack.length === 0) return true;
  if (store.heatCooldownPhase) {
    return allCooldownLapsComplete(store);
  }
  if (!store.nextHeat.length) return false;
  if (!allOnTrackAreForNextHeat(store)) return false;
  return true;
}

function maybeDrainFinishedHeat(store) {
  if (!store.heatFrozen || store.autoFinishExportPending) return;

  if (store.onTrack.length === 0) {
    store.currentHeat = [];
    store.heatFrozen = false;
    store.heatAutoFinishTriggered = false;
    store.heatCooldownPhase = false;
    if (store.nextHeat.length > 0) {
      promoteNextHeat(store);
    }
    return;
  }

  if (allOnTrackAreForNextHeat(store)) {
    store.heatFrozen = false;
    store.heatAutoFinishTriggered = false;
    store.heatCooldownPhase = false;
    promoteNextHeat(store, { preserveOnTrack: true });
  }
}

function moveKartToPitExit(store, kartNumber, laneId) {
  const n = Number(kartNumber);
  const lid = String(laneId);
  const lane = store.pitLines?.[lid];
  if (!lane) return;
  lane.karts = (lane.karts || []).filter((k) => Number(k) !== n);
  lane.karts.unshift(n);
}

function tryAssignReturnedKartToNextHeat(store, kartNumber, laneId) {
  if (!store.nextHeat.length) return false;
  const n = Number(kartNumber);
  const inCurrent = store.currentHeat.some((r) => Number(r.kart_number) === n);
  if (!inCurrent || isKartReservedForNextHeat(store, n)) return false;

  const pendingRow = store.nextHeat.find(
    (r) => r.kart_pending && (r.kart_number == null || Number.isNaN(Number(r.kart_number))),
  );
  if (!pendingRow) return false;

  pendingRow.kart_number = n;
  pendingRow.kart_pending = false;
  moveKartToPitExit(store, n, laneId);
  return true;
}

function returnKartsNotInNextHeat(store) {
  if (!store.nextHeat.length) {
    return {
      returned: [],
      kept: store.onTrack.map((ot) => Number(ot.kart_number)),
    };
  }

  const nextSet = getNextHeatKartNumbers(store);
  const pendingCount = countPendingNextHeatKarts(store);
  const snapshot = [...store.onTrack];
  const kept = [];
  const returned = [];

  snapshot.forEach((ot) => {
    const n = Number(ot.kart_number);
    if (nextSet.has(n)) {
      kept.push(n);
      return;
    }

    const inCurrentHeat = store.currentHeat.some((r) => Number(r.kart_number) === n);
    if (pendingCount > 0 && inCurrentHeat && store.heatCooldownPhase
      && ot.cooldownLapPending && !ot.cooldownLapDone) {
      kept.push(n);
      return;
    }

    const result = returnKart(store, n, ot.originLaneId ?? ot.laneId ?? 1, {
      skipNextHeatGuard: true,
      skipDrain: true,
    });
    if (result.success) returned.push(n);
  });

  maybeDrainFinishedHeat(store);
  checkAutoFinish(store);
  return { returned, kept };
}

function isTimedHeat(store) {
  return (store.heatSettings?.type || 'time') === 'time'
    && (store.heatSettings?.duration || 0) > 0;
}

function isSprintHeat(store) {
  return (store.heatSettings?.type || 'time') === 'sprint';
}

function getSprintTargetLaps(store) {
  return Math.max(0, Number(store.heatSettings?.targetLaps) || 0);
}

function allSprintTargetLapsReached(store) {
  const target = getSprintTargetLaps(store);
  if (target <= 0 || !store.currentHeat.length) return false;
  return store.currentHeat.every((row) => (row.lap_count || 0) >= target);
}

function isHeatTimeExpired(store) {
  if (!isTimedHeat(store) || !store.heatRuntime?.startedAt) return false;
  const durationMin = store.heatSettings?.duration || 10;
  const elapsedSec = Math.floor((Date.now() - store.heatRuntime.startedAt) / 1000);
  return elapsedSec >= durationMin * 60;
}

function isCooldownLapCrossing(store, ot, row) {
  if (!store.heatCooldownPhase && !ot.cooldownLapPending) return false;
  if (isSprintHeat(store)) {
    const target = getSprintTargetLaps(store);
    return target > 0 && (row.lap_count || 0) >= target;
  }
  if (isTimedHeat(store)) {
    return isHeatTimeExpired(store) || ot.cooldownLapPending;
  }
  return false;
}

function syncHeatCooldownPhase(store) {
  if (store.heatFrozen || store.heatAutoFinishTriggered || store.heatCooldownPhase) return;
  if (!store.onTrack.length) return;

  if (isTimedHeat(store) && isHeatTimeExpired(store)) {
    store.heatCooldownPhase = true;
    store.onTrack.forEach((ot) => { ot.cooldownLapPending = true; });
    if (store.nextHeat.length > 0 && countPendingNextHeatKarts(store) === 0) {
      returnKartsNotInNextHeat(store);
    }
    return;
  }

  if (isSprintHeat(store) && allSprintTargetLapsReached(store)) {
    const target = getSprintTargetLaps(store);
    store.heatCooldownPhase = true;
    store.onTrack.forEach((ot) => {
      const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(ot.kart_number));
      if (row && (row.lap_count || 0) >= target) {
        ot.cooldownLapPending = true;
      }
    });
    if (store.nextHeat.length > 0 && countPendingNextHeatKarts(store) === 0) {
      returnKartsNotInNextHeat(store);
    }
  }
}

function shouldAutoFinishHeat(store) {
  if (!getHeatDriverCount(store)) return false;
  if (!allOnTrackClearedOrReadyForNextHeatDrain(store)) return false;
  if (isTimedHeat(store)) return isHeatTimeExpired(store);
  if (isSprintHeat(store)) {
    const target = getSprintTargetLaps(store);
    return target > 0 && allSprintTargetLapsReached(store);
  }
  return false;
}

function pushHeatHistory(store, resultsOverride = null) {
  const results = resultsOverride || store.currentHeat;
  if (!results?.length) return;
  store.heatHistory.push({
    heat_number: getCurrentHeatNumber(store),
    heat_type: store.heatSettings.type,
    results: JSON.parse(JSON.stringify(results)),
    created_at: new Date().toISOString(),
  });
}

function autoFinishHeatSession(store) {
  const savedStartedAt = store.heatRuntime.startedAt;
  enduranceRules.tickEnduranceRules(store, { final: true });
  applyAutoLevelUpgrades(store);
  if (store.currentHeat.length > 0) {
    pushHeatHistory(store);
  }
  store.heatRuntime.startedAt = null;
  store.heatCooldownPhase = false;
  store.heatFrozen = true;
  store.heatAutoFinishTriggered = true;
  store.autoFinishStartedAt = savedStartedAt;
  store.autoFinishHeatNumber = getCurrentHeatNumber(store);
  const hs = store.heatSettings || {};
  const wantsExport = hs.exportCsv !== false || Boolean(hs.exportPdf);
  store.autoFinishExportPending = wantsExport;
  if (!wantsExport) {
    maybeDrainFinishedHeat(store);
  }
}

function isHeatClockExpired(store) {
  if (!isTimedHeat(store) || !store.heatRuntime?.startedAt) return false;
  return isHeatTimeExpired(store);
}

function hasActiveTimingSession(store) {
  if (store.heatFrozen) return false;
  if (!store.currentHeat.length) return false;
  if (store.heatCooldownPhase) return false;
  if (isFormationPhase(store) && store.onTrack.length > 0) return true;
  if (isSprintHeat(store) && allSprintTargetLapsReached(store)) return false;
  if (isTimedHeat(store) && isHeatTimeExpired(store)) return false;
  if (store.onTrack.length > 0) return true;
  if (!store.heatRuntime?.startedAt) return false;
  if (isTimedHeat(store)) {
    return !isHeatTimeExpired(store);
  }
  return true;
}

function shouldQueueNextHeat(store) {
  if (store.heatFrozen && store.currentHeat.length > 0) return true;
  return hasActiveTimingSession(store);
}

function getLaunchHeatRows(store) {
  if (hasActiveTimingSession(store)) return store.currentHeat;
  if (store.nextHeat.length > 0) return store.nextHeat;
  return store.currentHeat;
}

function kartHeatTarget(store, kartNumber) {
  const n = Number(kartNumber);
  const onTrack = store.onTrack.some((k) => Number(k.kart_number) === n);
  const inCurrent = store.currentHeat.some((r) => Number(r.kart_number) === n);
  const inNext = store.nextHeat.some((r) => Number(r.kart_number) === n);
  if (onTrack && inCurrent) return 'current';
  if (onTrack && inNext && !inCurrent) return 'next';
  if (hasActiveTimingSession(store) && inCurrent) return 'current';
  if (inNext) return 'next';
  if (inCurrent) return 'current';
  return null;
}

function getKartPitPosition(store, kartNumber) {
  const n = Number(kartNumber);
  for (const [laneId, lane] of Object.entries(store.pitLines || {})) {
    const karts = lane.karts || [];
    const idx = karts.findIndex((k) => Number(k) === n);
    if (idx >= 0) {
      return { inPits: true, laneId, atExit: idx === 0, queueIndex: idx };
    }
  }
  return { inPits: false, laneId: null, atExit: false, queueIndex: -1 };
}

function canLaunchNextHeatKart(store, kartNumber) {
  const n = Number(kartNumber);
  if (store.onTrack.some((k) => Number(k.kart_number) === n)) return false;
  if (!store.nextHeat.some((r) => Number(r.kart_number) === n)) return false;
  if (hasActiveTimingSession(store) && store.currentHeat.some((r) => Number(r.kart_number) === n)) {
    return false;
  }
  return getKartPitPosition(store, n).atExit;
}

function resolveAssignmentStatus(store, row, { isNextHeat = false } = {}) {
  if (row.kart_pending && (row.kart_number == null || Number.isNaN(Number(row.kart_number)))) {
    return 'awaiting_track_kart';
  }
  const n = Number(row.kart_number);
  const onTrack = store.onTrack.some((k) => Number(k.kart_number) === n);
  if (onTrack && isNextHeat) return 'waiting_on_track';
  if (onTrack) return 'on_track';
  const pit = getKartPitPosition(store, n);
  if (isNextHeat && canLaunchNextHeatKart(store, n)) return 'ready_to_launch';
  if (pit.inPits && !pit.atExit) return 'in_pits_queue';
  if (pit.atExit && !onTrack) return isNextHeat ? 'at_pit_exit' : 'assigned';
  return 'prepared';
}

function getNextHeatReadiness(store) {
  const onTrackNums = new Set(store.onTrack.map((k) => Number(k.kart_number)));
  let waitingOnTrack = 0;
  let inPitsQueue = 0;
  let atPitExit = 0;
  let readyToLaunch = 0;
  store.nextHeat.forEach((row) => {
    if (row.kart_pending && (row.kart_number == null || Number.isNaN(Number(row.kart_number)))) {
      waitingOnTrack += 1;
      return;
    }
    const n = Number(row.kart_number);
    if (onTrackNums.has(n)) {
      waitingOnTrack += 1;
      return;
    }
    const pit = getKartPitPosition(store, n);
    if (canLaunchNextHeatKart(store, n)) {
      readyToLaunch += 1;
      atPitExit += 1;
    } else if (pit.inPits && !pit.atExit) {
      inPitsQueue += 1;
    } else if (pit.atExit) {
      atPitExit += 1;
    }
  });
  return {
    total: store.nextHeat.length,
    waitingOnTrack,
    inPitsQueue,
    atPitExit,
    readyToLaunch,
    sessionActive: hasActiveTimingSession(store),
  };
}

function promoteNextHeat(store, options = {}) {
  if (!store.nextHeat.length) return false;
  const preserve = Boolean(options.preserveOnTrack);
  const nextKartNums = getNextHeatKartNumbers(store);
  let preservedOnTrack = [];
  if (preserve) {
    preservedOnTrack = store.onTrack.filter((ot) => nextKartNums.has(Number(ot.kart_number)));
  }

  if (store.currentHeat.length) {
    applyAutoLevelUpgrades(store);
    pushHeatHistory(store);
  }
  store.currentHeat = JSON.parse(JSON.stringify(store.nextHeat));
  store.nextHeat = [];
  if (store.nextHeatSettings) {
    store.heatSettings = { ...store.heatSettings, ...store.nextHeatSettings };
    store.nextHeatSettings = null;
  }

  if (preserve && preservedOnTrack.length) {
    store.onTrack = preservedOnTrack.map((ot) => {
      const n = Number(ot.kart_number);
      const row = store.currentHeat.find((r) => Number(r.kart_number) === n);
      return {
        ...ot,
        originLaneId: ot.originLaneId ?? ot.laneId ?? null,
        simulatedLaps: row?.lap_count || 0,
        lap_count: row?.lap_count || 0,
        driver_name: row?.driver_name || ot.driver_name,
        driver_level: row?.driver_level || ot.driver_level,
        cooldownLapPending: false,
        cooldownLapDone: false,
        formationLapsDone: 0,
        trackPosition: ot.trackPosition ?? 0,
        avgLapSec: getAvgLapSec(store),
      };
    });
  } else {
    store.onTrack = [];
  }

  store.heatRuntime.startedAt = null;
  store.heatAutoFinishTriggered = false;
  store.heatCooldownPhase = false;
  resetFormationState(store);
  assignHeatNumber(store);
  if (trackProfile.isSessionHeatType(store.heatSettings?.type)) {
    store.onTrack.forEach((ot) => {
      ot.trackPosition = 0;
      ot.lap_count = 0;
      ot.simulatedLaps = 0;
      ot.cooldownLapPending = false;
      ot.cooldownLapDone = false;
    });
  }
  schedulePersist(store);
  return true;
}

function buildHeatClockPayload(fields) {
  return {
    clockMode: 'down',
    running: false,
    started: false,
    startedAt: null,
    durationMin: 10,
    targetLaps: 0,
    elapsedSec: 0,
    remainingSec: 0,
    hasDrivers: false,
    onTrackCount: 0,
    expired: false,
    draining: false,
    cooldownPhase: false,
    racePhase: 'normal',
    formationLapsRequired: 0,
    formationLapsProgress: 0,
    startMode: 'grid',
    ...fields,
  };
}

function maxOnTrackLapCount(store) {
  if (!store.onTrack.length) return 0;
  return store.onTrack.reduce((max, ot) => {
    const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(ot.kart_number));
    return Math.max(max, row?.lap_count || 0);
  }, 0);
}

function resolveHeatRacePhase(store, ctx) {
  const {
    isSprint,
    isTimed,
    cooldownPhase,
    onTrackCount,
    timeExpired,
    targetLaps,
    heatFrozen,
  } = ctx;

  if (heatFrozen || store.heatAutoFinishTriggered) return 'checkered';

  if (isFormationPhase(store) && onTrackCount > 0) return 'formation';

  if (isSprint && targetLaps > 0) {
    if (cooldownPhase) return 'checkered';
    if (onTrackCount > 0 && maxOnTrackLapCount(store) >= targetLaps - 1 && !allSprintTargetLapsReached(store)) {
      return 'last_lap';
    }
    return 'normal';
  }

  if (isTimed) {
    const cooldownDone = allCooldownLapsComplete(store);
    if (onTrackCount > 0 && (cooldownPhase || timeExpired) && !cooldownDone) return 'last_lap';
    if (timeExpired && (onTrackCount === 0 || cooldownDone)) return 'checkered';
    return 'normal';
  }

  return 'normal';
}

function attachRacePhase(store, payload, ctx) {
  const formationRequired = getFormationLapsRequired(store);
  return {
    ...payload,
    racePhase: resolveHeatRacePhase(store, { ...ctx, heatFrozen: store.heatFrozen }),
    formationLapsRequired: formationRequired,
    formationLapsProgress: maxFormationLapsDone(store),
    startMode: store.heatSettings?.startMode || 'grid',
    formationActive: isFormationPhase(store),
  };
}

function getHeatClock(store) {
  if (!store.heatFrozen && !store.heatAutoFinishTriggered) {
    syncHeatCooldownPhase(store);
  }
  const heatType = store.heatSettings?.type || 'time';
  const isSprint = heatType === 'sprint';
  const durationMin = store.heatSettings?.duration || 10;
  const targetLaps = getSprintTargetLaps(store);
  const startedAt = store.heatRuntime?.startedAt;
  const hasDrivers = getHeatDriverCount(store) > 0;
  const onTrackCount = store.onTrack.length;
  const cooldownPhase = Boolean(store.heatCooldownPhase);
  const phaseCtx = {
    isSprint,
    isTimed: !isSprint && isTimedHeat(store),
    cooldownPhase,
    onTrackCount,
    targetLaps,
    timeExpired: false,
  };

  if (store.heatFrozen) {
    const frozenStartedAt = store.autoFinishStartedAt || startedAt;
    const frozenElapsed = frozenStartedAt
      ? Math.floor((Date.now() - frozenStartedAt) / 1000)
      : durationMin * 60;
    return attachRacePhase(store, buildHeatClockPayload({
      clockMode: isSprint ? 'up' : 'down',
      running: false,
      started: Boolean(frozenStartedAt),
      startedAt: frozenStartedAt,
      durationMin,
      targetLaps,
      elapsedSec: isSprint ? frozenElapsed : durationMin * 60,
      remainingSec: isSprint ? null : 0,
      hasDrivers,
      onTrackCount,
      expired: true,
      draining: onTrackCount > 0,
      cooldownPhase: false,
    }), { ...phaseCtx, timeExpired: !isSprint, heatFrozen: true });
  }

  if (!startedAt) {
    return attachRacePhase(store, buildHeatClockPayload({
      clockMode: isSprint ? 'up' : 'down',
      durationMin,
      targetLaps,
      remainingSec: isSprint ? null : durationMin * 60,
      hasDrivers,
      onTrackCount,
    }), phaseCtx);
  }

  if (!hasDrivers) {
    store.heatRuntime.startedAt = null;
    return attachRacePhase(store, buildHeatClockPayload({
      clockMode: isSprint ? 'up' : 'down',
      durationMin,
      targetLaps,
      remainingSec: isSprint ? null : durationMin * 60,
      hasDrivers: false,
      onTrackCount,
    }), phaseCtx);
  }

  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);

  if (isSprint) {
    return attachRacePhase(store, buildHeatClockPayload({
      clockMode: 'up',
      running: !store.heatAutoFinishTriggered,
      started: true,
      startedAt,
      durationMin,
      targetLaps,
      elapsedSec,
      remainingSec: null,
      hasDrivers,
      onTrackCount,
      expired: store.heatAutoFinishTriggered,
      draining: cooldownPhase && onTrackCount > 0,
      cooldownPhase,
    }), phaseCtx);
  }

  const totalSec = durationMin * 60;
  const remainingSec = Math.max(0, totalSec - elapsedSec);
  const timeExpired = remainingSec <= 0;

  return attachRacePhase(store, buildHeatClockPayload({
    clockMode: 'down',
    running: !timeExpired || cooldownPhase,
    started: true,
    startedAt,
    durationMin,
    targetLaps,
    elapsedSec,
    remainingSec,
    hasDrivers,
    onTrackCount,
    expired: timeExpired,
    draining: timeExpired && onTrackCount > 0,
    cooldownPhase: timeExpired && cooldownPhase,
  }), { ...phaseCtx, timeExpired });
}

function transponderToKart(store, transponderId) {
  const tid = String(transponderId).trim();
  const teamMap = store.teamTransponderMap || {};
  if (teamMap[tid]) return Number(teamMap[tid]);

  const rows = [...store.currentHeat, ...store.nextHeat];
  for (const row of rows) {
    const drivers = normalizeTeamDrivers(row.team_drivers) || [];
    const match = drivers.find((d) => d.transponder_id && d.transponder_id === tid);
    if (match) return Number(row.kart_number);
    if (row.transponder_id && String(row.transponder_id) === tid) return Number(row.kart_number);
  }

  const map = store.transponderMap || {};
  if (map[tid]) return Number(map[tid]);
  const asNum = parseInt(tid, 10);
  if (!Number.isNaN(asNum) && asNum > 0) return asNum;
  return null;
}

function launchKartByTransponder(store, kartNumber, laneId) {
  if (!getLaunchHeatRows(store).length) {
    return { success: false, error: 'no_drivers_in_heat' };
  }
  return launchKart(store, kartNumber, laneId);
}

function processTransponderPitExit(store, transponderId) {
  const kartNumber = transponderToKart(store, transponderId);
  if (!kartNumber) return { success: false, error: 'unknown_transponder' };
  const laneEntry = Object.entries(store.pitLines).find(([, lane]) => (
    lane?.karts?.length && Number(lane.karts[0]) === kartNumber
  ));
  if (!laneEntry) return { success: false, error: 'not_at_exit' };
  const [laneId] = laneEntry;
  const target = kartHeatTarget(store, kartNumber);
  if (!target) return { success: false, error: 'not_in_heat' };
  if (target === 'next' && hasActiveTimingSession(store)
    && store.currentHeat.some((r) => Number(r.kart_number) === Number(kartNumber))) {
    return { success: false, error: 'session_still_active' };
  }
  return launchKartByTransponder(store, kartNumber, laneId);
}

function processTransponderPitEntry(store, transponderId) {
  const kartNumber = transponderToKart(store, transponderId);
  if (!kartNumber) return { success: false, error: 'unknown_transponder' };
  const onTrack = store.onTrack.find((k) => Number(k.kart_number) === Number(kartNumber));
  if (!onTrack) return { success: false, error: 'not_on_track' };
  const laneId = onTrack.originLaneId ?? onTrack.laneId;
  return returnKart(store, kartNumber, laneId);
}

function processTransponderLap(store, transponderId, lapTimeSec = null) {
  const kartNumber = transponderToKart(store, transponderId);
  if (!kartNumber) return { success: false, error: 'unknown_transponder' };
  const ot = store.onTrack.find((k) => Number(k.kart_number) === kartNumber);
  if (!ot) return { success: false, error: 'not_on_track' };
  const row = store.currentHeat.find((r) => Number(r.kart_number) === kartNumber);
  if (!row) return { success: false, error: 'not_in_heat' };

  const now = Date.now();
  const prevLapAt = ot.lastLapAt || ot.launchedAt;
  const lapSec = lapTimeSec != null && !Number.isNaN(Number(lapTimeSec))
    ? Number(lapTimeSec)
    : (now - prevLapAt) / 1000;

  recordLapCrossing(store, ot, row, lapSec);
  ot.simulatedLaps = row.lap_count;

  return {
    success: true,
    kart_number: kartNumber,
    lap_count: row.lap_count,
    last_lap_time: row.last_lap_time,
    is_session_fastest: lapToSeconds(row.last_lap_time) === getSessionFastestLapSec(store),
  };
}

function scanTransponderExits(store) {
  const launchRows = getLaunchHeatRows(store);
  if (!launchRows.length) return [];
  const launched = [];
  const heatKarts = new Set(launchRows.map((r) => Number(r.kart_number)));
  const onTrackKarts = new Set(store.onTrack.map((k) => Number(k.kart_number)));

  Object.entries(store.pitLines).forEach(([laneId, lane]) => {
    if (!lane?.karts?.length) return;
    const kartNumber = Number(lane.karts[0]);
    if (!heatKarts.has(kartNumber) || onTrackKarts.has(kartNumber)) return;
    const result = launchKartByTransponder(store, kartNumber, laneId);
    if (result.success) {
      launched.push(kartNumber);
      onTrackKarts.add(kartNumber);
    }
  });
  return launched;
}

function placeKartOnTrack(store, kartNumber, options = {}) {
  const gridDeploy = Boolean(options.gridDeploy);
  const n = Number(kartNumber);

  if (!gridDeploy) {
    const lid = String(options.laneId);
    const lane = store.pitLines[lid];
    if (!lane?.karts?.length || Number(lane.karts[0]) !== n) {
      return { success: false, error: 'not_at_exit' };
    }
    lane.karts.shift();
  } else {
    if (!isLeMansStart(store)) return { success: false, error: 'not_le_mans_start' };
    removeKartFromPitLanes(store, n);
  }

  if (store.onTrack.some((k) => Number(k.kart_number) === n)) {
    return { success: false, error: 'already_on_track' };
  }

  const target = kartHeatTarget(store, n);
  if (target === 'next') {
    if (hasActiveTimingSession(store) && store.currentHeat.some((r) => Number(r.kart_number) === n)) {
      return { success: false, error: 'session_still_active' };
    }
    promoteNextHeat(store);
  } else if (target !== 'current') {
    return { success: false, error: 'not_in_heat' };
  }

  const heatRow = store.currentHeat.find((r) => Number(r.kart_number) === n);
  const now = Date.now();
  store.onTrack.push({
    kart_number: n,
    originLaneId: gridDeploy ? null : Number(options.laneId),
    launchedAt: now,
    lastLapAt: now,
    simulatedLaps: heatRow?.lap_count || 0,
    formationLapsDone: 0,
    trackPosition: 0,
    driver_name: heatRow?.driver_name || `Kart ${kartNumber}`,
    driver_level: heatRow?.driver_level || 'Amateur',
    avgLapSec: getAvgLapSec(store),
    lap_count: heatRow?.lap_count || 0,
  });

  if (!isFormationPhase(store) && !store.heatRuntime.startedAt && getHeatDriverCount(store) > 0) {
    store.heatRacingStarted = true;
    store.heatRuntime.startedAt = now;
  }

  if (heatRow && isEnduranceMode(store) && store.heatRacingStarted) {
    if (heatRow.pit_entered_at) {
      const pitDur = Math.round((now - heatRow.pit_entered_at) / 1000);
      heatRow.total_pit_time_sec = (heatRow.total_pit_time_sec || 0) + pitDur;
      heatRow.last_pit_duration_sec = pitDur;
      heatRow.pit_entered_at = null;
    }
    const driverName = heatRow.active_driver || heatRow.driver_name;
    startStint(heatRow, driverName);
    heatRow.pit_penalty_served_sec = 0;
  }

  return { success: true, heatClock: getHeatClock(store) };
}

function launchKart(store, kartNumber, laneId) {
  if (isLeMansStart(store) && !store.heatRacingStarted) {
    return { success: false, error: 'use_grid_deploy' };
  }
  return placeKartOnTrack(store, kartNumber, { laneId, gridDeploy: false });
}

function deployGridKart(store, kartNumber) {
  if (!isLeMansStart(store)) return { success: false, error: 'not_le_mans_start' };
  if (store.heatRacingStarted) return { success: false, error: 'race_already_started' };
  return placeKartOnTrack(store, kartNumber, { gridDeploy: true });
}

function deployAllGridKarts(store) {
  if (!isLeMansStart(store)) return { success: false, error: 'not_le_mans_start' };
  const onSet = new Set(store.onTrack.map((k) => Number(k.kart_number)));
  const deployed = [];
  store.currentHeat.forEach((row) => {
    const n = Number(row.kart_number);
    if (onSet.has(n)) return;
    const result = deployGridKart(store, n);
    if (result.success) {
      deployed.push(n);
      onSet.add(n);
    }
  });
  return {
    success: deployed.length > 0,
    deployed,
    heatClock: getHeatClock(store),
  };
}

function returnKart(store, kartNumber, laneId, options = {}) {
  const n = Number(kartNumber);
  const otEntry = store.onTrack.find((k) => Number(k.kart_number) === n);
  if (
    !options.skipNextHeatGuard
    && store.nextHeat.length > 0
    && isKartReservedForNextHeat(store, n)
  ) {
    if (store.heatFrozen && !store.heatCooldownPhase) {
      return { success: false, error: 'keep_for_next_heat' };
    }
    if (store.heatCooldownPhase && otEntry?.cooldownLapPending && !otEntry?.cooldownLapDone) {
      return { success: false, error: 'keep_for_next_heat' };
    }
  }

  const idx = store.onTrack.findIndex((k) => Number(k.kart_number) === n);
  if (idx < 0) return { success: false, error: 'not_on_track' };

  const ot = store.onTrack[idx];
  store.onTrack.splice(idx, 1);
  const targetLane = laneId ?? ot.originLaneId ?? ot.laneId;
  const lid = String(targetLane);
  const assignedPending = tryAssignReturnedKartToNextHeat(store, n, targetLane);
  const reservedForNext = isKartReservedForNextHeat(store, n) || assignedPending;

  if (store.pitLines[lid]) {
    const alreadyThere = store.pitLines[lid].karts.some((k) => Number(k) === n);
    const inOtherLane = Object.entries(store.pitLines).some(([id, lane]) => (
      id !== lid && (lane.karts || []).some((k) => Number(k) === n)
    ));
    if (!alreadyThere && !inOtherLane) {
      if (reservedForNext) {
        moveKartToPitExit(store, n, lid);
      } else {
        store.pitLines[lid].karts.push(n);
      }
    } else if (reservedForNext) {
      moveKartToPitExit(store, n, lid);
    }
  }

  const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(kartNumber));
  if (row) {
    row.lap_count = row.lap_count || 0;
    if (isEnduranceMode(store)) {
      const now = Date.now();
      if (row.current_stint) closeStint(row, now);
      row.pit_visits = (row.pit_visits || 0) + 1;
      row.pit_entered_at = now;
      row.pit_penalty_served_sec = 0;
      if (ot.launchedAt) {
        row.last_stint_duration_sec = Math.round((now - ot.launchedAt) / 1000);
      }
      if (applyPendingDriverChange(row)) {
        enduranceRules.tickEnduranceRules(store);
      }
    }
  }

  if (!options.skipDrain) {
    maybeDrainFinishedHeat(store);
    checkAutoFinish(store);
  }

  return {
    success: true,
    onTrack: store.onTrack,
    heatClock: getHeatClock(store),
    heatDrained: !store.heatFrozen && store.onTrack.length === 0,
    retired: true,
  };
}

function applyAutoLevelUpgrades(store) {
  store.currentHeat.forEach((row) => {
    row.driver_level = resolveDriverLevel(store, row);
    if (!row.registered) return;
    const driver = store.drivers.find((d) => d.full_name === row.driver_name);
    if (driver) driver.driver_level = row.driver_level;
  });
}

function sortAssignmentRows(store) {
  const rows = store.currentHeat.slice();
  const heatType = store.heatSettings?.type || 'time';
  if (heatType === 'sprint' || heatType === 'endurance') {
    return rows.sort(getTimingSortFn(store));
  }
  return rows.sort((a, b) => (a.assignmentOrder ?? 0) - (b.assignmentOrder ?? 0));
}

function sortNextHeatRows(store, rows) {
  const heatType = store.nextHeatSettings?.type || store.heatSettings?.type || 'time';
  if (heatType === 'sprint' || heatType === 'endurance') {
    return rows.slice().sort((a, b) => (a.assignmentOrder ?? 0) - (b.assignmentOrder ?? 0));
  }
  return rows.slice().sort((a, b) => (a.assignmentOrder ?? 0) - (b.assignmentOrder ?? 0));
}

function getAssignments(store) {
  if (store.nextHeat.length > 0) {
    return sortNextHeatRows(store, store.nextHeat)
      .map((r, i) => ({
        position: i + 1,
        kart_number: r.kart_number,
        driver_name: r.driver_name,
        team_name: r.team_name || null,
        team_drivers: normalizeTeamDrivers(r.team_drivers)?.map((d) => d.name) || null,
        active_driver: r.active_driver || null,
        driver_level: r.driver_level,
        lap_count: 0,
        status: resolveAssignmentStatus(store, r, { isNextHeat: true }),
      }));
  }
  if (store.currentHeat.length > 0) {
    return sortAssignmentRows(store)
      .map((r, i) => ({
        position: i + 1,
        kart_number: r.kart_number,
        driver_name: r.driver_name,
        team_name: r.team_name || null,
        team_drivers: normalizeTeamDrivers(r.team_drivers)?.map((d) => d.name) || null,
        active_driver: r.active_driver || null,
        driver_level: r.driver_level,
        lap_count: r.lap_count || 0,
        status: resolveAssignmentStatus(store, r, { isNextHeat: false }),
      }));
  }
  return store.driverQueue.map((d, i) => ({
    position: i + 1,
    driver_name: d.name,
    kart_number: null,
    status: 'queued',
  }));
}

function getTrackPosition(store, row) {
  const ot = store.onTrack.find((k) => Number(k.kart_number) === Number(row.kart_number));
  return ot?.trackPosition ?? 0;
}

function getTimingSortFn(store) {
  const heatType = store.heatSettings?.type || 'time';
  if (heatType === 'endurance') {
    return (a, b) => {
      const lapDiff = (b.lap_count || 0) - (a.lap_count || 0);
      if (lapDiff !== 0) return lapDiff;
      const penDiff = (a.unserved_penalty_sec || 0) - (b.unserved_penalty_sec || 0);
      if (penDiff !== 0) return penDiff;
      return getTrackPosition(store, b) - getTrackPosition(store, a);
    };
  }
  if (heatType === 'sprint') {
    return (a, b) => {
      const lapDiff = (b.lap_count || 0) - (a.lap_count || 0);
      if (lapDiff !== 0) return lapDiff;
      const posDiff = getTrackPosition(store, b) - getTrackPosition(store, a);
      if (posDiff !== 0) return posDiff;
      return lapToSeconds(a.best_lap_time) - lapToSeconds(b.best_lap_time);
    };
  }
  return (a, b) => lapToSeconds(a.best_lap_time) - lapToSeconds(b.best_lap_time);
}

function getTimingData(store) {
  tickHeatSimulation(store);
  tickPenaltyService(store);
  enduranceRules.tickEnduranceRules(store);
  checkAutoFinish(store);
  const order = getTimingSortFn(store);
  const sessionFastestSec = getSessionFastestLapSec(store);
  const endurance = isEnduranceMode(store);

  return store.currentHeat
    .slice()
    .sort(order)
    .map((r) => {
      const ot = store.onTrack.find((k) => Number(k.kart_number) === Number(r.kart_number));
      const enriched = withResolvedLevel(store, r);
      const lastSec = lapToSeconds(r.last_lap_time);
      const isSessionFastest = sessionFastestSec !== Infinity
        && lastSec !== Infinity
        && lastSec === sessionFastestSec;
      const base = {
        ...enriched,
        team_name: r.team_name || null,
        active_driver: r.active_driver || null,
        team_drivers: normalizeTeamDrivers(r.team_drivers)?.map((d) => d.name) || null,
        track_position: ot?.trackPosition ?? 0,
        is_session_fastest: isSessionFastest,
        lap_times: r.lap_times || [],
        unserved_penalty_sec: r.unserved_penalty_sec || 0,
        in_pits: Boolean(r.pit_entered_at && !ot),
      };
      if (endurance) {
        return { ...base, ...enrichEnduranceTiming(store, r, ot) };
      }
      return base;
    })
    .slice(0, 30);
}

function buildHeatRow(body, index, endurance = false) {
  const isRegistered = Boolean(body.registered || body.phone || body.email);
  const savedLevel = isRegistered ? (body.driver_level || 'Amateur') : 'Amateur';
  const teamDrivers = normalizeTeamDrivers(body.team_drivers);
  const activeDriver = body.active_driver
    || (teamDrivers?.[0]?.name)
    || body.driver_name;
  const row = {
    track_id: 1,
    kart_number: body.kart_number,
    kart_pending: Boolean(body.kart_pending || body.pending_from_track),
    driver_name: body.driver_name,
    team_name: body.team_name || null,
    team_drivers: teamDrivers,
    driver_level: savedLevel,
    registered: isRegistered,
    assignmentOrder: body.assignment_order ?? index + 1,
    last_lap_time: null,
    best_lap_time: null,
    second_best_lap_time: null,
    avg_lap_time: null,
    lap_count: 0,
    lap_times: [],
  };
  if (endurance) {
    const activeEntry = teamDrivers?.find((d) => d.name === activeDriver) || teamDrivers?.[0];
    Object.assign(row, {
      active_driver: activeDriver,
      transponder_id: body.transponder_id || activeEntry?.transponder_id || null,
      pit_visits: 0,
      pit_entered_at: null,
      pit_penalty_served_sec: 0,
      total_pit_time_sec: 0,
      total_penalty_served_sec: 0,
      unserved_penalty_sec: 0,
      penalties: [],
      stints: [],
      current_stint: null,
    });
  }
  return row;
}

function registerDriverIfNeeded(store, body) {
  const isRegistered = Boolean(body.registered || body.phone || body.email);
  if (!isRegistered || (!body.phone && !body.email)) return;
  const exists = store.drivers.some((d) => d.full_name === body.driver_name);
  if (!exists) {
    store.drivers.push({
      full_name: body.driver_name,
      phone: body.phone || null,
      email: body.email || null,
      driver_level: body.driver_level || 'Amateur',
    });
  }
}

function assignHeatBatch(store, assignmentRows, settings) {
  if (!assignmentRows?.length) return { success: false, error: 'no_assignments' };

  assignmentRows.forEach((body, i) => {
    registerDriverIfNeeded(store, body);
  });

  const endurance = settings?.type === 'endurance' || store.heatSettings?.type === 'endurance';
  const rows = assignmentRows.map((body, i) => buildHeatRow(body, i, endurance));
  const prepare = shouldQueueNextHeat(store);

  if (prepare) {
    store.nextHeat = rows;
    store.nextHeatSettings = settings ? { ...settings } : null;
  } else {
    if (store.currentHeat.length) {
      applyAutoLevelUpgrades(store);
      const hasResults = store.currentHeat.some((r) => (r.lap_count || 0) > 0 || r.best_lap_time);
      if (hasResults) {
        pushHeatHistory(store);
      }
    }
    store.currentHeat = rows;
    store.nextHeat = [];
    store.nextHeatSettings = null;
    if (settings) store.heatSettings = { ...store.heatSettings, ...settings };
    store.onTrack = [];
    store.heatRuntime.startedAt = null;
    store.heatAutoFinishTriggered = false;
    resetFormationState(store);
    assignHeatNumber(store);
  }

  return {
    success: true,
    prepared: prepare,
    count: rows.length,
    heatNumber: prepare ? getCurrentHeatNumber(store) : store.dailyHeat?.current,
  };
}

function assignDriver(store, body) {
  const {
    kart_number, driver_name, driver_level, phone, email, registered,
    team_name: teamName, team_drivers: teamDrivers,
  } = body;
  const isRegistered = Boolean(registered || phone || email);
  const savedLevel = isRegistered ? (driver_level || 'Amateur') : 'Amateur';
  const existing = store.currentHeat.find((r) => Number(r.kart_number) === Number(kart_number));
  if (existing) {
    existing.driver_name = driver_name;
    existing.registered = isRegistered;
    existing.driver_level = savedLevel;
    if (teamName) existing.team_name = teamName;
    if (Array.isArray(teamDrivers) && teamDrivers.length) existing.team_drivers = teamDrivers;
    if (body.assignment_order != null) existing.assignmentOrder = body.assignment_order;
    return;
  }
  const assignmentOrder = body.assignment_order ?? store.currentHeat.length + 1;
  store.currentHeat.push({
    track_id: 1,
    kart_number,
    driver_name,
    team_name: teamName || null,
    team_drivers: Array.isArray(teamDrivers) && teamDrivers.length ? teamDrivers : null,
    driver_level: savedLevel,
    registered: isRegistered,
    assignmentOrder,
    last_lap_time: null,
    best_lap_time: null,
    lap_count: 0,
    lap_times: [],
  });
  if (isRegistered && (phone || email)) {
    store.drivers.push({
      full_name: driver_name,
      phone: phone || null,
      email: email || null,
      driver_level: savedLevel,
    });
  }
}

function clearHeat(store) {
  store.currentHeat = [];
  store.nextHeat = [];
  store.nextHeatSettings = null;
  store.onTrack = [];
  store.heatRuntime.startedAt = null;
  store.heatAutoFinishTriggered = false;
  store.heatFrozen = false;
  store.heatCooldownPhase = false;
  resetFormationState(store);
}

function finishHeat(store, options = {}) {
  if (store.heatAutoFinishTriggered && store.heatFrozen) {
    return { success: true, duplicate: true };
  }
  const keepOnTrack = Boolean(options.keepOnTrack) && store.onTrack.length > 0;
  applyAutoLevelUpgrades(store);
  if (store.currentHeat.length > 0) {
    pushHeatHistory(store);
  }
  store.heatRuntime.startedAt = null;
  if (keepOnTrack) {
    store.heatFrozen = true;
    if (store.nextHeat.length > 0) {
      returnKartsNotInNextHeat(store);
    }
  } else {
    enduranceRules.tickEnduranceRules(store, { final: true });
    store.currentHeat = [];
    store.onTrack = [];
    store.heatFrozen = false;
    store.heatAutoFinishTriggered = false;
    store.heatCooldownPhase = false;
    resetFormationState(store);
  }
  schedulePersist(store);
  return { success: true, keepOnTrack };
}

function exportData(store) {
  return store.currentHeat
    .slice()
    .sort((a, b) => lapToSeconds(a.best_lap_time) - lapToSeconds(b.best_lap_time));
}

function updateDriverLevel(store, lookup, level, password) {
  if (store.levelSettings.editPassword && password !== store.levelSettings.editPassword) {
    return { success: false, error: 'bad_password' };
  }
  const driver = store.drivers.find((d) => d.phone === lookup || d.email === lookup);
  if (!driver) return { success: false, error: 'Driver not found' };
  driver.driver_level = level;
  store.currentHeat.forEach((row) => {
    if (row.driver_name === driver.full_name) row.driver_level = level;
  });
  return { success: true };
}

function checkAutoFinish(store) {
  syncHeatCooldownPhase(store);
  if (shouldAutoFinishHeat(store) && !store.heatAutoFinishTriggered) {
    autoFinishHeatSession(store);
  }
  return {
    autoFinishRequested: Boolean(store.autoFinishExportPending),
    heatClock: getHeatClock(store),
  };
}

function acknowledgeAutoExport(store) {
  store.autoFinishExportPending = false;
  store.autoFinishStartedAt = null;
  store.autoFinishHeatNumber = null;
  maybeDrainFinishedHeat(store);
  return { success: true };
}

function enrichOnTrack(store) {
  return store.onTrack.map((ot) => {
    const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(ot.kart_number));
    return {
      ...ot,
      laneId: ot.originLaneId ?? ot.laneId,
      lap_count: row?.lap_count || ot.lap_count || 0,
      driver_name: row?.driver_name || ot.driver_name,
      inPits: false,
    };
  });
}

function getEffectiveHeatType(store, mode) {
  if (mode === 'assignments' && store.nextHeat.length && store.nextHeatSettings?.type) {
    return store.nextHeatSettings.type;
  }
  return store.heatSettings?.type || 'time';
}

function addPenalty(store, kartNumber, { seconds, reason } = {}) {
  const row = findHeatRowByKart(store, kartNumber);
  if (!row) return { success: false, error: 'not_in_heat' };
  const sec = Math.max(0, Number(seconds) || 0);
  if (sec <= 0) return { success: false, error: 'invalid_seconds' };
  if (!Array.isArray(row.penalties)) row.penalties = [];
  row.penalties.push({
    seconds: sec,
    reason: reason || '',
    created_at: new Date().toISOString(),
    served_sec: 0,
  });
  row.unserved_penalty_sec = (row.unserved_penalty_sec || 0) + sec;
  return { success: true, unserved_penalty_sec: row.unserved_penalty_sec };
}

function applyPendingDriverChange(row) {
  if (!row?.pending_active_driver) return false;
  const next = row.pending_active_driver;
  if (row.active_driver && row.active_driver !== next) {
    row.driver_swap_count = (row.driver_swap_count || 0) + 1;
  }
  row.active_driver = next;
  const drivers = normalizeTeamDrivers(row.team_drivers) || [];
  const match = drivers.find((d) => d.name === next);
  if (match?.transponder_id) row.transponder_id = match.transponder_id;
  delete row.pending_active_driver;
  return true;
}

function setActiveDriver(store, kartNumber, driverName, options = {}) {
  const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(kartNumber));
  if (!row) return { success: false, error: 'not_in_heat' };
  const drivers = normalizeTeamDrivers(row.team_drivers) || [];
  const match = drivers.find((d) => d.name === driverName);
  if (!match && driverName !== row.driver_name) {
    return { success: false, error: 'driver_not_on_team' };
  }
  const onTrack = store.onTrack.some((k) => Number(k.kart_number) === Number(kartNumber));
  if (onTrack && !options.forceInPits) {
    row.pending_active_driver = driverName;
    return { success: true, pending: true, pending_active_driver: driverName };
  }
  if (row.active_driver && row.active_driver !== driverName) {
    row.driver_swap_count = (row.driver_swap_count || 0) + 1;
  }
  row.active_driver = driverName;
  row.transponder_id = match?.transponder_id || row.transponder_id || null;
  delete row.pending_active_driver;
  if (row.pit_entered_at && !onTrack) {
    startStint(row, driverName);
  }
  enduranceRules.tickEnduranceRules(store);
  return { success: true, active_driver: row.active_driver, transponder_id: row.transponder_id };
}

function getTrackProfile(store) {
  return trackProfile.normalizeTrackProfile(store.trackProfile, store.trackSlug);
}

function updateTrackProfile(store, patch = {}) {
  store.trackProfile = trackProfile.normalizeTrackProfile(
    { ...getTrackProfile(store), ...patch },
    store.trackSlug,
  );
  schedulePersist(store);
  return { success: true, profile: store.trackProfile };
}

function getKioskTrackConfig(store) {
  const profile = getTrackProfile(store);
  const plan = trackProfile.calculateDayPlan(profile);
  return {
    trackSlug: store.trackSlug,
    profile,
    dayPlan: plan,
    heatSettings: store.heatSettings,
    onboarded: Boolean(store.trackSetup?.onboarded),
    kartNumbers: store.trackSetup?.kartNumbers || '',
    sessionHeatType: 'time',
    competitiveHeatTypes: ['sprint', 'endurance'],
  };
}

function registerTeamTransponder(store, transponderId, kartNumber) {
  const tid = String(transponderId).trim();
  const kart = Number(kartNumber);
  if (!tid || Number.isNaN(kart)) return { success: false, error: 'invalid_map' };
  if (!store.teamTransponderMap) store.teamTransponderMap = {};
  store.teamTransponderMap[tid] = kart;
  return { success: true, teamTransponderMap: store.teamTransponderMap };
}

function getSessionState(store) {
  store.pitLines = sanitizePitLines(store.pitLines);
  scanTransponderExits(store);
  tickHeatSimulation(store);
  tickPenaltyService(store);
  enduranceRules.tickEnduranceRules(store);
  const { autoFinishRequested } = checkAutoFinish(store);
  maybeDrainFinishedHeat(store);
  const heatClock = getHeatClock(store);
  const state = {
    heatSettings: store.heatSettings,
    nextHeatSettings: store.nextHeatSettings,
    heatRuntime: store.heatRuntime,
    heatClock,
    heatDriverCount: getHeatDriverCount(store),
    nextHeatDriverCount: store.nextHeat.length,
    heatKartNumbers: store.currentHeat.map((r) => Number(r.kart_number)),
    nextHeatKartNumbers: store.nextHeat.map((r) => Number(r.kart_number)),
    hasPreparedHeat: store.nextHeat.length > 0,
    nextHeatReadiness: store.nextHeat.length > 0 ? getNextHeatReadiness(store) : null,
    hasActiveTimingSession: hasActiveTimingSession(store),
    heatFrozen: Boolean(store.heatFrozen),
    autoFinishRequested,
    autoFinishStartedAt: store.autoFinishStartedAt ?? null,
    autoFinishHeatNumber: store.autoFinishHeatNumber ?? null,
    onTrack: enrichOnTrack(store),
    pitLines: store.pitLines,
    pitExitPosition: store.levelSettings?.pitExitPosition || 'bottom',
    heatNumber: getCurrentHeatNumber(store),
    dailyHeatCounter: store.dailyHeat?.counter || 0,
    trackProfile: getTrackProfile(store),
    dayPlan: trackProfile.calculateDayPlan(getTrackProfile(store)),
    enduranceTeams: store.currentHeat
      .filter((r) => Array.isArray(r.team_drivers) && r.team_drivers.length > 0)
      .map((r) => ({
        kart_number: Number(r.kart_number),
        team_name: r.team_name || r.driver_name,
        active_driver: r.active_driver || null,
        team_drivers: normalizeTeamDrivers(r.team_drivers)?.map((d) => d.name) || [],
      })),
    topLaps: {
      day: getTopLaps(store, 'day', 10),
      week: getTopLaps(store, 'week', 10),
      month: getTopLaps(store, 'month', 10),
    },
  };
  schedulePersist(store);
  return state;
}

function getReceptionState(store) {
  return {
    driverQueue: store.driverQueue || [],
    heatNumber: getCurrentHeatNumber(store),
    hasActiveSession: hasActiveTimingSession(store),
    currentHeatCount: store.currentHeat.length,
    heatType: store.heatSettings?.type || 'time',
  };
}

function addReceptionDriver(store, { name, phone, team_name, driver_level } = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { success: false, error: 'missing_name' };
  if (!Array.isArray(store.driverQueue)) store.driverQueue = [];
  store.driverQueue.push({
    name: trimmed,
    phone: phone || null,
    team_name: team_name || null,
    driver_level: driver_level || 'Amateur',
    added_at: new Date().toISOString(),
    source: 'reception',
  });
  schedulePersist(store);
  return { success: true, driverQueue: store.driverQueue };
}

function removeReceptionDriver(store, index) {
  if (!Array.isArray(store.driverQueue)) return { success: false, error: 'empty_queue' };
  const idx = Number(index);
  if (Number.isNaN(idx) || idx < 0 || idx >= store.driverQueue.length) {
    return { success: false, error: 'invalid_index' };
  }
  store.driverQueue.splice(idx, 1);
  schedulePersist(store);
  return { success: true, driverQueue: store.driverQueue };
}

function getResultsForHeatNumber(store, heatNumber) {
  const n = Number(heatNumber);
  if (Number.isNaN(n) || n <= 0) return null;
  const fromHistory = [...(store.heatHistory || [])].reverse().find((h) => h.heat_number === n);
  if (fromHistory) return fromHistory;
  if (getCurrentHeatNumber(store) === n && store.currentHeat.length > 0) {
    return {
      heat_number: n,
      heat_type: store.heatSettings?.type || 'time',
      results: store.currentHeat,
      created_at: null,
      live: true,
    };
  }
  return null;
}

function listHeatResults(store, limit = 20) {
  return (store.heatHistory || []).slice(-limit).reverse().map((h) => ({
    heat_number: h.heat_number,
    heat_type: h.heat_type,
    created_at: h.created_at,
    driver_count: h.results?.length || 0,
  }));
}

function getLivePayload(store, mode) {
  maybeDrainFinishedHeat(store);
  const rows = mode === 'assignments' ? getAssignments(store) : getTimingData(store);
  return {
    rows,
    heatType: getEffectiveHeatType(store, mode),
    heatClock: getHeatClock(store),
    timingColumns: store.heatSettings?.timingColumns || null,
    timingColumnOrder: store.heatSettings?.timingColumnOrder || null,
    hasPreparedHeat: store.nextHeat.length > 0,
    heatNumber: getCurrentHeatNumber(store),
    topLaps: {
      day: getTopLaps(store, 'day', 10),
      week: getTopLaps(store, 'week', 10),
      month: getTopLaps(store, 'month', 10),
    },
  };
}

module.exports = {
  sanitizePitLines,
  resolveWorkspace,
  resolveFromParts,
  resetStore,
  exportSnapshot,
  applySnapshot,
  validateWorkspaceId,
  validateTrackSlug,
  getAssignments,
  getTimingData,
  getLivePayload,
  getSessionState,
  getHeatClock,
  getHeatDriverCount,
  launchKart,
  deployGridKart,
  deployAllGridKarts,
  beginRacingPhase,
  returnKart,
  returnKartsNotInNextHeat,
  processTransponderPitExit,
  processTransponderPitEntry,
  processTransponderLap,
  getNextHeatReadiness,
  canLaunchNextHeatKart,
  scanTransponderExits,
  assignDriver,
  assignHeatBatch,
  clearHeat,
  finishHeat,
  acknowledgeAutoExport,
  exportData,
  updateDriverLevel,
  lapToSeconds,
  hasActiveTimingSession,
  getSessionFastestLapSec,
  getTopLaps,
  addPenalty,
  setActiveDriver,
  registerTeamTransponder,
  getTrackProfile,
  updateTrackProfile,
  getKioskTrackConfig,
  getCurrentHeatNumber,
  persistStore,
  schedulePersist,
  getReceptionState,
  addReceptionDriver,
  removeReceptionDriver,
  getResultsForHeatNumber,
  listHeatResults,
  computeAvgLapFromTimes,
};
