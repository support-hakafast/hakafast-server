const stores = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_AVG_LAP_SEC = 45;

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
    heatSettings: { type: 'time', duration: 10, targetLaps: 0, exportCsv: true, exportPdf: false },
    heatRuntime: { startedAt: null, avgLapSec: DEFAULT_AVG_LAP_SEC },
    onTrack: [],
    levelSettings: {
      editPassword: '',
      masterLapThreshold: '45.500',
      proLapThreshold: '42.000',
    },
    trackSetup: null,
    driverQueue: [],
    currentHeat: [],
    drivers: [],
    heatHistory: [],
    clientSnapshot: null,
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

function levelFromBestLap(store, bestLap, fallback = 'Amateur') {
  const bestSec = lapToSeconds(bestLap);
  if (bestSec === Infinity) return fallback;
  const proSec = lapToSeconds(store.levelSettings.proLapThreshold);
  const masterSec = lapToSeconds(store.levelSettings.masterLapThreshold);
  if (bestSec <= proSec) return 'Pro';
  if (bestSec <= masterSec) return 'Master';
  return 'Amateur';
}

function resolveDriverLevel(store, row) {
  if (row.best_lap_time) {
    const fallback = row.registered ? (row.driver_level || 'Amateur') : 'Amateur';
    return levelFromBestLap(store, row.best_lap_time, fallback);
  }
  if (row.registered && row.driver_level) return row.driver_level;
  return 'Amateur';
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

function tickHeatSimulation(store) {
  if (!store.onTrack.length) return;
  const now = Date.now();
  const avgLap = getAvgLapSec(store);

  store.onTrack.forEach((ot) => {
    const row = store.currentHeat.find((r) => Number(r.kart_number) === Number(ot.kart_number));
    if (!row) return;

    const elapsedSec = (now - ot.launchedAt) / 1000;
    const laps = Math.floor(elapsedSec / avgLap);
    const inLapSec = elapsedSec % avgLap;

    row.lap_count = laps;
    row.last_lap_time = formatLap(inLapSec);

    if (laps > 0) {
      const bestSec = simulatedBestSec(avgLap, ot.kart_number);
      const currentBest = lapToSeconds(row.best_lap_time);
      if (currentBest === Infinity || bestSec < currentBest) {
        row.best_lap_time = formatLap(bestSec);
      }
      if (!row.registered) {
        row.driver_level = levelFromBestLap(store, row.best_lap_time, 'Amateur');
      } else {
        row.driver_level = resolveDriverLevel(store, row);
      }
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

function scanTransponderExits(store) {
  if (!getHeatDriverCount(store)) return [];
  const launched = [];
  Object.entries(store.pitLines).forEach(([laneId, lane]) => {
    if (!lane?.karts?.length) return;
    const kartNumber = Number(lane.karts[0]);
    if (!store.currentHeat.some((r) => Number(r.kart_number) === kartNumber)) return;
    if (store.onTrack.some((k) => Number(k.kart_number) === kartNumber)) return;
    const result = launchKartByTransponder(store, kartNumber, laneId);
    if (result.success) launched.push(kartNumber);
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
    laneId: Number(laneId),
    launchedAt: Date.now(),
    driver_name: heatRow?.driver_name || `Kart ${kartNumber}`,
    driver_level: heatRow?.driver_level || 'Amateur',
    avgLapSec: getAvgLapSec(store),
  });

  if (!store.heatRuntime.startedAt && getHeatDriverCount(store) > 0) {
    store.heatRuntime.startedAt = Date.now();
  }
  return { success: true, heatClock: getHeatClock(store) };
}

function returnKart(store, kartNumber, laneId) {
  const idx = store.onTrack.findIndex((k) => Number(k.kart_number) === Number(kartNumber));
  if (idx < 0) return { success: false, error: 'not_on_track' };

  store.onTrack.splice(idx, 1);
  const lid = String(laneId);
  if (store.pitLines[lid]) {
    store.pitLines[lid].karts.push(Number(kartNumber));
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

function getAssignments(store) {
  if (store.currentHeat.length > 0) {
    return store.currentHeat
      .slice()
      .sort((a, b) => Number(a.kart_number) - Number(b.kart_number))
      .map((r, i) => ({
        position: i + 1,
        kart_number: r.kart_number,
        driver_name: r.driver_name,
        driver_level: r.driver_level,
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

function getTimingData(store) {
  tickHeatSimulation(store);
  const order = store.heatSettings.type === 'sprint'
    ? (a, b) => (b.lap_count || 0) - (a.lap_count || 0) || lapToSeconds(a.best_lap_time) - lapToSeconds(b.best_lap_time)
    : (a, b) => lapToSeconds(a.best_lap_time) - lapToSeconds(b.best_lap_time);
  return store.currentHeat
    .filter((r) => store.onTrack.some((k) => Number(k.kart_number) === Number(r.kart_number)))
    .slice()
    .sort(order)
    .map((r) => withResolvedLevel(store, r))
    .slice(0, 30);
}

function assignDriver(store, body) {
  const { kart_number, driver_name, driver_level, phone, email, registered } = body;
  const isRegistered = Boolean(registered || phone || email);
  const savedLevel = isRegistered ? (driver_level || 'Amateur') : 'Amateur';
  const existing = store.currentHeat.find((r) => Number(r.kart_number) === Number(kart_number));
  if (existing) {
    existing.driver_name = driver_name;
    existing.registered = isRegistered;
    existing.driver_level = savedLevel;
    return;
  }
  store.currentHeat.push({
    track_id: 1,
    kart_number,
    driver_name,
    driver_level: savedLevel,
    registered: isRegistered,
    last_lap_time: null,
    best_lap_time: null,
    lap_count: 0,
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

function getSessionState(store) {
  scanTransponderExits(store);
  const { autoFinishRequested, heatClock } = checkAutoFinish(store);
  return {
    heatSettings: store.heatSettings,
    heatRuntime: store.heatRuntime,
    heatClock,
    heatDriverCount: getHeatDriverCount(store),
    heatKartNumbers: store.currentHeat.map((r) => Number(r.kart_number)),
    autoFinishRequested,
    onTrack: store.onTrack,
    pitLines: store.pitLines,
  };
}

function getLivePayload(store, mode) {
  const rows = mode === 'assignments' ? getAssignments(store) : getTimingData(store);
  return {
    rows,
    heatType: store.heatSettings?.type || 'time',
    heatClock: getHeatClock(store),
  };
}

module.exports = {
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
  scanTransponderExits,
  assignDriver,
  clearHeat,
  finishHeat,
  exportData,
  updateDriverLevel,
  lapToSeconds,
};
