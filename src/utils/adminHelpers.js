/** Each kart number may appear at most once across all lanes (one physical kart). */
export function sanitizePitLines(linesData) {
  if (!linesData) return linesData;
  const seen = new Set();
  const next = {};
  Object.entries(linesData).forEach(([laneId, lane]) => {
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

export function reconcileKartsFromLines(allKarts, linesData, onTrackNums = []) {
  const onSet = new Set(onTrackNums.map(Number));
  const inLane = new Map();
  const cleanLines = sanitizePitLines(linesData);
  Object.entries(cleanLines || {}).forEach(([laneId, lane]) => {
    (lane.karts || []).forEach((num) => {
      const n = Number(num);
      if (!inLane.has(n)) inLane.set(n, Number(laneId));
    });
  });

  const next = { ...allKarts };
  Object.keys(next).forEach((key) => {
    const n = Number(key);
    const prev = next[key];
    if (!prev) return;
    if (onSet.has(n)) {
      next[key] = { ...prev, number: n, lane: null, onTrack: true };
    } else if (inLane.has(n)) {
      next[key] = { ...prev, number: n, lane: inLane.get(n), onTrack: false };
    } else {
      next[key] = { ...prev, number: n, lane: null, onTrack: false };
    }
  });

  inLane.forEach((laneId, num) => {
    const key = String(num);
    if (!next[key] && !next[num] && !onSet.has(num)) {
      next[key] = { number: num, active: true, lane: laneId, onTrack: false };
    }
  });
  return next;
}

export function formatHeatClock(clock, notStartedLabel, expiredLabel = '00:00', phaseLabels = {}) {
  if (clock?.racePhase === 'checkered') {
    return phaseLabels.checkered || '🏁';
  }
  if (clock?.racePhase === 'formation') {
    const required = clock.formationLapsRequired || 1;
    const done = clock.formationLapsProgress || 0;
    if (phaseLabels.formation) {
      return phaseLabels.formation.replace('{{done}}', String(done)).replace('{{required}}', String(required));
    }
    return `F ${done}/${required}`;
  }
  if (clock?.racePhase === 'last_lap') {
    return phaseLabels.lastLap || 'LAST LAP';
  }
  if (!clock?.startedAt) return notStartedLabel;

  if (clock.clockMode === 'up') {
    const elapsed = clock.elapsedSec ?? 0;
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  if (clock.expired) return expiredLabel;

  const remaining = clock.remainingSec ?? 0;
  if (remaining <= 0) return expiredLabel;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getHeatClockClassName(clock) {
  if (clock?.racePhase === 'checkered') return ' is-checkered';
  if (clock?.racePhase === 'formation') return ' is-formation';
  if (clock?.racePhase === 'last_lap') return ' is-last-lap';
  if (clock?.startedAt && (clock.running || clock.cooldownPhase)) return ' is-running';
  return '';
}

export function parseKartNumbers(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return [];
  const nums = new Set();
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  parts.forEach((part) => {
    if (part.includes('-')) {
      const [rawA, rawB] = part.split('-');
      const start = parseInt(rawA.trim(), 10);
      const end = parseInt(rawB.trim(), 10);
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        for (let i = lo; i <= hi; i += 1) nums.add(i);
      }
    } else {
      const n = parseInt(part, 10);
      if (!Number.isNaN(n) && n > 0) nums.add(n);
    }
  });
  if (nums.size === 0) {
    const solo = parseInt(trimmed, 10);
    if (!Number.isNaN(solo) && solo > 0) nums.add(solo);
  }
  return [...nums].sort((a, b) => a - b);
}

export function getExitKartNumber(lane) {
  if (!lane?.karts?.length) return null;
  return Number(lane.karts[0]);
}

export function getWaitingKartNumbers(lane) {
  if (!lane?.karts?.length || lane.karts.length <= 1) return [];
  return lane.karts.slice(1).map(Number);
}

export function groupQueueByTeam(queue) {
  const teams = [];
  const map = new Map();
  queue.forEach((d) => {
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

/** Sort on-track karts by expected pit entry order (cooldown first, then earliest last crossing). */
export function orderOnTrackKartsForPitEntry(onTrackList = []) {
  const entries = onTrackList.map((item) => {
    if (item != null && typeof item === 'object') {
      return {
        kart: Number(item.kart_number ?? item.kart),
        cooldownLapPending: Boolean(item.cooldownLapPending),
        lastLapAt: Number(item.lastLapAt) || 0,
        launchedAt: Number(item.launchedAt) || 0,
      };
    }
    return {
      kart: Number(item),
      cooldownLapPending: false,
      lastLapAt: 0,
      launchedAt: 0,
    };
  }).filter((e) => !Number.isNaN(e.kart) && e.kart > 0);

  return entries.sort((a, b) => {
    if (a.cooldownLapPending !== b.cooldownLapPending) {
      return a.cooldownLapPending ? -1 : 1;
    }
    const aTime = a.lastLapAt || a.launchedAt;
    const bTime = b.lastLapAt || b.launchedAt;
    if (aTime !== bTime) return aTime - bTime;
    return a.kart - b.kart;
  }).map((e) => e.kart);
}

function countPitKartsInLines(workingLines, laneKeys) {
  return laneKeys.reduce((sum, key) => sum + (workingLines[key]?.karts?.length || 0), 0);
}

export function pickKartsForAssignment(workingLines, laneKeys, driverCount, options = {}) {
  const usePendingTrackSlots = Boolean(options.pendingOnTrackSlots);
  const onTrackOrdered = orderOnTrackKartsForPitEntry(options.onTrackKarts || []);
  const pitKartTotal = countPitKartsInLines(workingLines, laneKeys);

  if (pitKartTotal + onTrackOrdered.length < driverCount) {
    return { assigned: [], complete: false };
  }

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
      if (usePendingTrackSlots) {
        const pendingAlready = assigned.filter((a) => a.pendingFromTrack).length;
        if (pendingAlready < onTrackOrdered.length) {
          found = {
            kart: null,
            lane: null,
            depth: -1,
            source: 'on_track_pending',
            pendingFromTrack: true,
          };
        }
      } else {
        const trackKart = onTrackOrdered.find((n) => !used.has(n));
        if (trackKart != null) {
          found = { kart: trackKart, lane: null, depth: -1, source: 'on_track' };
        }
      }
    }

    if (!found) return { assigned, complete: false };
    if (found.kart != null) used.add(found.kart);
    assigned.push({ ...found, driverIndex: i });
  }
  return { assigned, complete: true };
}

export function buildExportFilename(heatType, startedAt, ext = 'csv') {
  const typeSlug = { time: 'time', endurance: 'endurance', sprint: 'sprint' }[heatType] || 'heat';
  const d = startedAt ? new Date(startedAt) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const datePart = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  const timePart = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `HF_${typeSlug}_${datePart}_${timePart}.${ext}`;
}

export function parseDriverNames(input) {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (trimmed.includes(',')) {
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [trimmed];
}

export function isBulkDriverInput(input) {
  return input.trim().includes(',');
}

export function downloadCsv(rows, filename = 'Results.csv', labels = {}) {
  const {
    pos = 'Pos',
    kart = 'Kart',
    driver = 'Driver',
    level = 'Level',
    last = 'Last',
    best = 'Best',
    laps = 'Laps',
  } = labels;
  let csv = `\uFEFF${pos},${kart},${driver},${level},${last},${best},${laps}\n`;
  rows.forEach((r, i) => {
    csv += `${i + 1},${r.kart_number},"${r.driver_name}",${r.driver_level || ''},${r.last_lap_time || ''},${r.best_lap_time || ''},${r.lap_count || 0}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printPdf(rows, title = 'HAKAFAST Results', labels = {}) {
  const {
    pos = '#',
    kart = 'Kart',
    driver = 'Driver',
    level = 'Level',
    last = 'Last',
    best = 'Best',
    laps = 'Laps',
    allLaps = 'All laps',
  } = labels;
  const win = window.open('', '_blank');
  if (!win) return;
  const hasLapHistory = rows.some((r) => Array.isArray(r.lap_times) && r.lap_times.length > 0);
  const rowsHtml = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.kart_number}</td>
      <td>${r.driver_name || ''}</td>
      <td>${r.driver_level || ''}</td>
      <td>${r.last_lap_time || ''}</td>
      <td>${r.best_lap_time || ''}</td>
      <td>${r.lap_count || 0}</td>
      ${hasLapHistory ? `<td style="text-align:start;font-size:0.85em">${(r.lap_times || []).join(' · ') || '—'}</td>` : ''}
    </tr>`).join('');
  const lapHistoryHeader = hasLapHistory ? `<th>${allLaps}</th>` : '';
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px;color:#000080}
    h1{margin:0 0 16px}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #cbd5e0;padding:8px;text-align:center}
    th{background:#000080;color:#fff}</style></head><body>
    <h1>${title}</h1>
    <table><thead><tr><th>${pos}</th><th>${kart}</th><th>${driver}</th><th>${level}</th><th>${last}</th><th>${best}</th><th>${laps}</th>${lapHistoryHeader}</tr></thead>
    <tbody>${rowsHtml}</tbody></table></body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
