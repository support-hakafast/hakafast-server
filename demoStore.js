const stores = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;
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
      exportCsv: true,
      exportPdf: false,
      timingColumns: { laps: true, second_best: false, avg_lap: false, level: false, gap: false },
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
    driverQueue: [],
    currentHeat: [],
    drivers: [],
    heatHistory: [],
    clientSnapshot: null,
    nextHeatPreview: null,
    livePreviewUntil: 0,
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
  if (!stores.has(key)) stores.set(key, createStore(trackSlug));
  const store = stores.get(key);
  store.lastAccess = Date.now();
  return store;
}

function resolveWorkspace(req) {
  const id = req.headers['x-hf-workspace'];
  const track = req.headers['x-hf-track'] || 'kart-demo';
  if (!id) return null;
  return getStore(track, id);
}

function resolveFromParts(trackSlug, workspaceId) {
  if (!workspaceId) return null;
  return getStore(trackSlug || 'kart-demo', workspaceId);
}

function resetStore(trackSlug, workspaceId) {
  const key = storeKey(trackSlug, workspaceId);
  stores.delete(key);
  return getStore(trackSlug, workspaceId);
}

function exportSnapshot(store) {
  if (!store) return null;
  return {
    trackSlug: store.trackSlug,
    pitLines: store.pitLines,
    heatSettings: store.heatSettings,
    heatRuntime: store.heatRuntime,
    onTrack: store.onTrack,
    levelSettings: store.levelSettings,
    trackSetup: store.trackSetup,
    driverQueue: store.driverQueue,
    currentHeat: store.currentHeat,
    drivers: store.drivers,
    clientSnapshot: store.clientSnapshot,
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
  if (snapshot.driverQueue) store.driverQueue = snapshot.driverQueue;
  if (snapshot.currentHeat) store.currentHeat = snapshot.currentHeat;
  if (snapshot.drivers) store.drivers = snapshot.drivers;
  if (snapshot.clientSnapshot) store.clientSnapshot = snapshot.clientSnapshot;
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
    if ((row.lap_count || 0) < 2) return;
    const sec = lapToSeconds(row.best_lap_time);
    if (sec < best) best = sec;
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

function pickKartsForAssignment(workingLines, laneKeys, driverCount) {
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
          found = { kart: kartNum, lane: key, depth };
          laneCursor = (laneCursor + offset + 1) % laneKeys.length;
          break;
        }
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

function withResolvedLevel(store, row) {
  return { ...row, driver_level: resolveDriverLevel(store, row) };
}

function recordLapCrossing(store, ot, row, lapSec) {
  const now = Date.now();
  ot.lastLapAt = now;
  ot.simulatedLaps = (ot.simulatedLaps || 0) + 1;

  row.lap_count = (row.lap_count || 0) + 1;
  row.last_lap_time = formatLap(lapSec);
  if (!Array.isArray(row.lap_times)) row.lap_times = [];
  row.lap_times.push(formatLap(lapSec));

  if (row.lap_count > 1) {
    const currentBest = lapToSeconds(row.best_lap_time);
    if (currentBest === Infinity || lapSec < currentBest) {
      if (currentBest !== Infinity) row.second_best_lap_time = row.best_lap_time;
      row.best_lap_time = formatLap(lapSec);
    } else if (!row.second_best_lap_time || lapSec < lapToSeconds(row.second_best_lap_time)) {
      row.second_best_lap_time = formatLap(lapSec);
    }
  }

  const elapsedSec = (now - ot.launchedAt) / 1000;
  if (row.lap_count > 0) row.avg_lap_time = formatLap(elapsedSec / row.lap_count);
  row.driver_level = resolveDriverLevel(store, row);
  ot.lap_count = row.lap_count;
}

function tickHeatSimulation(store) {
  if (!store.onTrack.length) return;
  const now = Date.now();
  const avgLap = getAvgLapSec(store);

  store.onTrack.forEach((ot) => {
    const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(ot.kart_number));
    if (!row) return;

    const sinceLapStart = (now - (ot.lastLapAt || ot.launchedAt)) / 1000;
    const totalElapsed = (now - ot.launchedAt) / 1000;
    ot.trackPosition = Math.min(0.999, (sinceLapStart % avgLap) / avgLap);

    const completedLaps = Math.floor(totalElapsed / avgLap);
    const prevSimLaps = ot.simulatedLaps || 0;
    if (completedLaps > prevSimLaps) {
      const jitter = ((ot.kart_number % 7) - 3) * 0.12;
      const lapSec = store.heatSettings?.type === 'endurance'
        ? avgLap + jitter
        : simulatedBestSec(avgLap, ot.kart_number) + jitter * 0.5;
      recordLapCrossing(store, ot, row, Math.max(1, lapSec));
      ot.simulatedLaps = completedLaps;
    }
  });
}

function getHeatDriverCount(store) {
  return store.currentHeat?.length || 0;
}

function getHeatClock(store) {
  const durationMin = store.heatSettings?.duration || 10;
  const startedAt = store.heatRuntime?.startedAt;
  const hasDrivers = getHeatDriverCount(store) > 0;
  if (!startedAt || !hasDrivers) {
    if (startedAt && !hasDrivers) store.heatRuntime.startedAt = null;
    return {
      running: false,
      startedAt: null,
      durationMin,
      remainingSec: durationMin * 60,
      elapsedSec: 0,
      hasDrivers,
    };
  }
  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
  const totalSec = durationMin * 60;
  const remainingSec = Math.max(0, totalSec - elapsedSec);
  return {
    running: remainingSec > 0,
    startedAt,
    durationMin,
    elapsedSec,
    remainingSec,
    hasDrivers,
    expired: remainingSec <= 0,
  };
}

function transponderToKart(store, transponderId) {
  const map = store.transponderMap || {};
  const tid = String(transponderId).trim();
  if (map[tid]) return Number(map[tid]);
  const asNum = parseInt(tid, 10);
  if (!Number.isNaN(asNum) && asNum > 0) return asNum;
  return null;
}

function launchKartByTransponder(store, kartNumber, laneId) {
  if (!getHeatDriverCount(store)) {
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
  const inHeat = store.currentHeat.some((r) => Number(r.kart_number) === kartNumber);
  if (!inHeat) return { success: false, error: 'not_in_heat' };
  return launchKartByTransponder(store, kartNumber, laneId);
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
  if (!getHeatDriverCount(store)) return [];
  const launched = [];
  const heatKarts = new Set(store.currentHeat.map((r) => Number(r.kart_number)));
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

function launchKart(store, kartNumber, laneId) {
  const lid = String(laneId);
  const lane = store.pitLines[lid];
  if (!lane?.karts?.length || Number(lane.karts[0]) !== Number(kartNumber)) {
    return { success: false, error: 'not_at_exit' };
  }
  if (store.onTrack.some((k) => Number(k.kart_number) === Number(kartNumber))) {
    return { success: false, error: 'already_on_track' };
  }

  lane.karts.shift();
  const heatRow = store.currentHeat.find((r) => Number(r.kart_number) === Number(kartNumber));
  store.onTrack.push({
    kart_number: Number(kartNumber),
    originLaneId: Number(laneId),
    launchedAt: Date.now(),
    lastLapAt: Date.now(),
    simulatedLaps: heatRow?.lap_count || 0,
    trackPosition: 0,
    driver_name: heatRow?.driver_name || `Kart ${kartNumber}`,
    driver_level: heatRow?.driver_level || 'Amateur',
    avgLapSec: getAvgLapSec(store),
    lap_count: heatRow?.lap_count || 0,
  });

  if (!store.heatRuntime.startedAt && getHeatDriverCount(store) > 0) {
    store.heatRuntime.startedAt = Date.now();
  }
  return { success: true, heatClock: getHeatClock(store) };
}

function returnKart(store, kartNumber, laneId) {
  const idx = store.onTrack.findIndex((k) => Number(k.kart_number) === Number(kartNumber));
  if (idx < 0) return { success: false, error: 'not_on_track' };

  const ot = store.onTrack[idx];
  store.onTrack.splice(idx, 1);
  const targetLane = laneId ?? ot.originLaneId ?? ot.laneId;
  const lid = String(targetLane);
  if (store.pitLines[lid]) {
    const n = Number(kartNumber);
    const alreadyThere = store.pitLines[lid].karts.some((k) => Number(k) === n);
    const inOtherLane = Object.entries(store.pitLines).some(([id, lane]) => (
      id !== lid && (lane.karts || []).some((k) => Number(k) === n)
    ));
    if (!alreadyThere && !inOtherLane) {
      store.pitLines[lid].karts.push(n);
    }
  }

  const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(kartNumber));
  if (row) {
    row.lap_count = row.lap_count || 0;
  }

  return { success: true, onTrack: store.onTrack };
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

function getAssignments(store) {
  if (store.currentHeat.length > 0) {
    return sortAssignmentRows(store)
      .map((r, i) => ({
        position: i + 1,
        kart_number: r.kart_number,
        driver_name: r.driver_name,
        team_name: r.team_name || null,
        team_drivers: r.team_drivers || null,
        driver_level: r.driver_level,
        lap_count: r.lap_count || 0,
        status: store.onTrack.some((k) => Number(k.kart_number) === Number(r.kart_number)) ? 'on_track' : 'assigned',
      }));
  }
  return store.driverQueue.map((d, i) => ({
    position: i + 1,
    driver_name: d.name,
    kart_number: null,
    status: 'queued',
  }));
}

function getTimingSortFn(store) {
  const heatType = store.heatSettings?.type || 'time';
  if (heatType === 'endurance') {
    return (a, b) => {
      const lapDiff = (b.lap_count || 0) - (a.lap_count || 0);
      if (lapDiff !== 0) return lapDiff;
      const posA = store.onTrack.find((k) => Number(k.kart_number) === Number(a.kart_number))?.trackPosition || 0;
      const posB = store.onTrack.find((k) => Number(k.kart_number) === Number(b.kart_number))?.trackPosition || 0;
      return posB - posA;
    };
  }
  if (heatType === 'sprint') {
    return (a, b) => (b.lap_count || 0) - (a.lap_count || 0)
      || lapToSeconds(a.best_lap_time) - lapToSeconds(b.best_lap_time);
  }
  return (a, b) => lapToSeconds(a.best_lap_time) - lapToSeconds(b.best_lap_time);
}

function getTimingData(store) {
  tickHeatSimulation(store);
  const order = getTimingSortFn(store);
  const sessionFastestSec = getSessionFastestLapSec(store);
  return store.currentHeat
    .filter((r) => store.onTrack.some((k) => Number(k.kart_number) === Number(r.kart_number)))
    .slice()
    .sort(order)
    .map((r) => {
      const ot = store.onTrack.find((k) => Number(k.kart_number) === Number(r.kart_number));
      const enriched = withResolvedLevel(store, r);
      const lastSec = lapToSeconds(r.last_lap_time);
      const isSessionFastest = sessionFastestSec !== Infinity
        && (r.lap_count || 0) >= 2
        && lastSec === sessionFastestSec;
      return {
        ...enriched,
        team_name: r.team_name || null,
        team_drivers: r.team_drivers || null,
        track_position: ot?.trackPosition ?? 0,
        is_session_fastest: isSessionFastest,
        lap_times: r.lap_times || [],
      };
    })
    .slice(0, 30);
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
  store.onTrack = [];
  store.heatRuntime.startedAt = null;
  store.heatAutoFinishTriggered = false;
  store.nextHeatPreview = null;
  store.livePreviewUntil = 0;
}

function finishHeat(store) {
  applyAutoLevelUpgrades(store);
  if (store.currentHeat.length > 0) {
    store.heatHistory.push({
      heat_type: store.heatSettings.type,
      results: JSON.parse(JSON.stringify(store.currentHeat)),
      created_at: new Date().toISOString(),
    });
  }
  store.onTrack = [];
  store.heatRuntime.startedAt = null;
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
  const clock = getHeatClock(store);
  if (!clock.expired || store.heatAutoFinishTriggered || !getHeatDriverCount(store)) {
    return { autoFinishRequested: false, heatClock: clock };
  }
  store.heatAutoFinishTriggered = true;
  return { autoFinishRequested: true, heatClock: clock };
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

function getSessionState(store) {
  store.pitLines = sanitizePitLines(store.pitLines);
  scanTransponderExits(store);
  tickHeatSimulation(store);
  clearExpiredPreview(store);
  const { autoFinishRequested, heatClock } = checkAutoFinish(store);
  const previewActive = store.livePreviewUntil > Date.now() && store.nextHeatPreview?.length;
  return {
    heatSettings: store.heatSettings,
    heatRuntime: store.heatRuntime,
    heatClock,
    heatDriverCount: getHeatDriverCount(store),
    heatKartNumbers: store.currentHeat.map((r) => Number(r.kart_number)),
    autoFinishRequested,
    onTrack: enrichOnTrack(store),
    pitLines: store.pitLines,
    pitExitPosition: store.levelSettings?.pitExitPosition || 'bottom',
    livePreviewActive: Boolean(previewActive),
    livePreviewUntil: store.livePreviewUntil || 0,
  };
}

function clearExpiredPreview(store) {
  if (store.livePreviewUntil && store.livePreviewUntil <= Date.now()) {
    store.nextHeatPreview = null;
    store.livePreviewUntil = 0;
  }
}

function prepareNextHeat(store, displaySec = 30) {
  clearExpiredPreview(store);
  if (!store.driverQueue?.length) return { success: false, error: 'no_drivers' };
  const laneKeys = Object.keys(store.pitLines).filter((id) => store.pitLines[id].active);
  if (!laneKeys.length) return { success: false, error: 'no_lanes' };

  const workingLines = JSON.parse(JSON.stringify(store.pitLines));
  const isEndurance = store.heatSettings?.type === 'endurance';
  const teams = isEndurance ? groupQueueByTeam(store.driverQueue) : null;
  const assignCount = isEndurance ? teams.length : store.driverQueue.length;
  const { assigned: kartSlots, complete } = pickKartsForAssignment(workingLines, laneKeys, assignCount);
  if (!complete) return { success: false, error: 'not_enough_karts' };

  const assignments = isEndurance
    ? teams.map((team, i) => ({
      kart: kartSlots[i].kart,
      teamName: team.teamName,
      teamDrivers: team.drivers.map((d) => d.name),
      driver: team.drivers[0],
    }))
    : kartSlots.map((slot, i) => ({
      kart: slot.kart,
      teamName: null,
      teamDrivers: null,
      driver: store.driverQueue[i],
    }));

  store.nextHeatPreview = assignments.map((assign, i) => {
    const driverLabel = isEndurance
      ? assign.teamDrivers.join(' · ')
      : assign.driver.name;
    return {
      position: i + 1,
      kart_number: assign.kart,
      driver_name: driverLabel,
      team_name: assign.teamName,
      team_drivers: assign.teamDrivers,
      status: 'preview',
    };
  });
  store.livePreviewUntil = Date.now() + Math.max(5, displaySec) * 1000;
  return { success: true, preview: store.nextHeatPreview, displaySec };
}

function getLivePayload(store, mode) {
  clearExpiredPreview(store);
  const previewActive = store.livePreviewUntil > Date.now() && store.nextHeatPreview?.length;
  if (previewActive) {
    return {
      rows: store.nextHeatPreview,
      heatType: store.heatSettings?.type || 'time',
      heatClock: getHeatClock(store),
      timingColumns: store.heatSettings?.timingColumns || null,
      livePreviewActive: true,
      effectiveMode: 'assignments',
    };
  }
  const rows = mode === 'assignments' ? getAssignments(store) : getTimingData(store);
  return {
    rows,
    heatType: store.heatSettings?.type || 'time',
    heatClock: getHeatClock(store),
    timingColumns: store.heatSettings?.timingColumns || null,
    livePreviewActive: false,
    effectiveMode: mode,
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
  returnKart,
  processTransponderPitExit,
  processTransponderLap,
  scanTransponderExits,
  assignDriver,
  clearHeat,
  finishHeat,
  exportData,
  updateDriverLevel,
  lapToSeconds,
  prepareNextHeat,
  getSessionFastestLapSec,
};
