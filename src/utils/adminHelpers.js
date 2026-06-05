export function reconcileKartsFromLines(allKarts, linesData, onTrackNums = []) {
  const onSet = new Set(onTrackNums.map(Number));
  const inLane = new Map();
  Object.entries(linesData || {}).forEach(([laneId, lane]) => {
    (lane.karts || []).forEach((num) => inLane.set(Number(num), Number(laneId)));
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
    if (!next[num] && !onSet.has(num)) {
      next[num] = { number: num, active: true, lane: laneId, onTrack: false };
    }
  });
  return next;
}

export function formatHeatClock(clock, notStartedLabel) {
  if (!clock?.running) return notStartedLabel;
  const m = Math.floor(clock.remainingSec / 60);
  const s = clock.remainingSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function parseKartNumbers(input) {
  const nums = new Set();
  const parts = input.split(',').map((p) => p.trim()).filter(Boolean);
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
      if (!Number.isNaN(n)) nums.add(n);
    }
  });
  return [...nums].sort((a, b) => a - b);
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

export function downloadCsv(rows, filename = 'Results.csv') {
  let csv = '\uFEFFPos,Kart,Driver,Level,Last,Best,Laps\n';
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

export function printPdf(rows, title = 'HAKAFAST Results') {
  const win = window.open('', '_blank');
  if (!win) return;
  const rowsHtml = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.kart_number}</td>
      <td>${r.driver_name || ''}</td>
      <td>${r.driver_level || ''}</td>
      <td>${r.last_lap_time || ''}</td>
      <td>${r.best_lap_time || ''}</td>
      <td>${r.lap_count || 0}</td>
    </tr>`).join('');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px;color:#000080}
    h1{margin:0 0 16px}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #cbd5e0;padding:8px;text-align:center}
    th{background:#000080;color:#fff}</style></head><body>
    <h1>${title}</h1>
    <table><thead><tr><th>#</th><th>Kart</th><th>Driver</th><th>Level</th><th>Last</th><th>Best</th><th>Laps</th></tr></thead>
    <tbody>${rowsHtml}</tbody></table></body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
