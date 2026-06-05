const stores = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;

function defaultPitLines() {
  return {
    1: { name: 'ליין 1', active: true, karts: [] },
    2: { name: 'ליין 2', active: true, karts: [] },
  };
}

function createStore(trackSlug = 'kart-demo') {
  return {
    trackSlug,
    createdAt: Date.now(),
    lastAccess: Date.now(),
    pitLines: defaultPitLines(),
    heatSettings: { type: 'time', duration: 10, targetLaps: 0 },
    levelSettings: {
      editPassword: '',
      masterLapThreshold: '45.500',
      proLapThreshold: '42.000',
    },
    trackSetup: null,
    driverQueue: [],
    currentHeat: [],
    drivers: [],
    heatSim: {},
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

function tickHeatSimulation(store) {
  store.currentHeat.forEach((row) => {
    const kart = row.kart_number;
    if (!store.heatSim[kart]) {
      store.heatSim[kart] = { base: 40 + Math.random() * 8, laps: 0 };
    }
    const sim = store.heatSim[kart];
    if (Math.random() > 0.35) {
      sim.laps += 1;
      const last = sim.base + (Math.random() - 0.5) * 0.9;
      row.last_lap_time = formatLap(last);
      row.lap_count = sim.laps;
      const best = parseFloat(row.best_lap_time);
      if (!row.best_lap_time || Number.isNaN(best) || last < best) {
        row.best_lap_time = formatLap(last);
      }
    }
  });
}

function applyAutoLevelUpgrades(store) {
  const proSec = lapToSeconds(store.levelSettings.proLapThreshold);
  const masterSec = lapToSeconds(store.levelSettings.masterLapThreshold);
  store.currentHeat.forEach((row) => {
    const bestSec = lapToSeconds(row.best_lap_time);
    if (bestSec === Infinity) return;
    let newLevel = null;
    if (bestSec <= proSec) newLevel = 'Pro';
    else if (bestSec <= masterSec) newLevel = 'Master';
    if (!newLevel) return;
    row.driver_level = newLevel;
    const driver = store.drivers.find((d) => d.full_name === row.driver_name);
    if (driver) driver.driver_level = newLevel;
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
        status: 'assigned',
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
  return store.currentHeat.slice().sort(order).slice(0, 30);
}

function assignDriver(store, body) {
  const { kart_number, driver_name, driver_level, phone, email } = body;
  store.currentHeat.push({
    track_id: 1,
    kart_number,
    driver_name,
    driver_level: driver_level || 'Amateur',
    last_lap_time: null,
    best_lap_time: null,
    lap_count: 0,
  });
  if (phone || email) {
    store.drivers.push({
      full_name: driver_name,
      phone: phone || null,
      email: email || null,
      driver_level: driver_level || 'Amateur',
    });
  }
  delete store.heatSim[kart_number];
}

function clearHeat(store) {
  store.currentHeat = [];
  store.heatSim = {};
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

function getLivePayload(store, mode) {
  const rows = mode === 'assignments' ? getAssignments(store) : getTimingData(store);
  return { rows, heatType: store.heatSettings?.type || 'time' };
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
  assignDriver,
  clearHeat,
  finishHeat,
  exportData,
  updateDriverLevel,
  lapToSeconds,
};
