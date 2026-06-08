function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

function computeAvgLapFromTimes(lapTimes) {
  if (!Array.isArray(lapTimes) || lapTimes.length === 0) return null;
  const secs = lapTimes.map(lapToSeconds).filter((s) => s !== Infinity);
  if (!secs.length) return null;
  const sum = secs.reduce((a, b) => a + b, 0);
  return formatLap(sum / secs.length);
}

function periodStart(period, now = new Date()) {
  const start = new Date(now);
  if (period === 'day') {
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === 'week') {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  start.setHours(0, 0, 0, 0);
  return start;
}

function ensureDailyHeat(store) {
  if (!store.dailyHeat) {
    store.dailyHeat = { date: getLocalDateStr(), counter: 0, current: null };
  }
  const today = getLocalDateStr();
  if (store.dailyHeat.date !== today) {
    store.dailyHeat = { date: today, counter: 0, current: null };
  }
}

function assignHeatNumber(store) {
  ensureDailyHeat(store);
  store.dailyHeat.counter += 1;
  store.dailyHeat.current = store.dailyHeat.counter;
  return store.dailyHeat.current;
}

function getCurrentHeatNumber(store) {
  ensureDailyHeat(store);
  return store.dailyHeat.current;
}

const MAX_LAP_RECORDS = 5000;

function recordLapStat(store, meta) {
  if (!store.lapRecords) store.lapRecords = [];
  const lapSec = meta.lap_sec;
  if (lapSec == null || Number.isNaN(lapSec) || lapSec <= 0) return;

  store.lapRecords.push({
    lap_sec: lapSec,
    lap_time: formatLap(lapSec),
    driver_name: meta.driver_name || null,
    team_name: meta.team_name || null,
    stint_driver: meta.stint_driver || null,
    kart_number: meta.kart_number || null,
    heat_number: meta.heat_number || null,
    recorded_at: meta.recorded_at || new Date().toISOString(),
  });

  if (store.lapRecords.length > MAX_LAP_RECORDS) {
    store.lapRecords = store.lapRecords.slice(-MAX_LAP_RECORDS);
  }
}

function getTopLaps(store, period = 'day', limit = 10) {
  const start = periodStart(period);
  const startMs = start.getTime();
  const seen = new Set();
  const ranked = [];

  (store.lapRecords || [])
    .filter((r) => new Date(r.recorded_at).getTime() >= startMs)
    .sort((a, b) => a.lap_sec - b.lap_sec)
    .forEach((r) => {
      const key = `${r.driver_name || ''}|${r.team_name || ''}|${r.lap_time}`;
      if (seen.has(key)) return;
      seen.add(key);
      ranked.push(r);
    });

  return ranked.slice(0, limit).map((r, i) => ({
    position: i + 1,
    lap_time: r.lap_time,
    lap_sec: r.lap_sec,
    driver_name: r.driver_name,
    team_name: r.team_name,
    stint_driver: r.stint_driver,
    kart_number: r.kart_number,
    heat_number: r.heat_number,
    recorded_at: r.recorded_at,
  }));
}

function formatDurationSec(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  getLocalDateStr,
  lapToSeconds,
  formatLap,
  computeAvgLapFromTimes,
  periodStart,
  ensureDailyHeat,
  assignHeatNumber,
  getCurrentHeatNumber,
  recordLapStat,
  getTopLaps,
  formatDurationSec,
};
