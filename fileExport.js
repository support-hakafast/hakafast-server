const fs = require('fs');
const path = require('path');
const { getExportsDir, ensureDataDirs } = require('./installConfig');

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestampSlug(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function sortResults(results, heatType = 'time') {
  const lapToSec = (lap) => {
    if (!lap || typeof lap !== 'string') return Infinity;
    const v = parseFloat(lap.trim());
    return Number.isNaN(v) ? Infinity : v;
  };
  return (results || []).slice().sort((a, b) => {
    if (heatType === 'sprint' || heatType === 'endurance') {
      const lapDiff = (b.lap_count || 0) - (a.lap_count || 0);
      if (lapDiff !== 0) return lapDiff;
    }
    return lapToSec(a.best_lap_time) - lapToSec(b.best_lap_time);
  });
}

function buildCsvRows(results, heatMeta = {}) {
  const header = 'Position,Kart,Driver,Level,Last Lap,Best Lap,Laps';
  const lines = [header];
  const sorted = sortResults(results, heatMeta.heatType);
  sorted.forEach((row, i) => {
    lines.push([
      i + 1,
      row.kart_number,
      `"${String(row.driver_name || '').replace(/"/g, '""')}"`,
      row.driver_level || '',
      row.last_lap_time || '',
      row.best_lap_time || '',
      row.lap_count || 0,
    ].join(','));
  });
  if (heatMeta.heatNumber) {
    lines.unshift(`# Heat ${heatMeta.heatNumber}`);
  }
  if (heatMeta.heatType) {
    lines.unshift(`# Type ${heatMeta.heatType}`);
  }
  return lines.join('\n');
}

function buildPdfHtml(results, heatMeta = {}) {
  const sorted = sortResults(results, heatMeta.heatType);
  const hasLapHistory = sorted.some((r) => Array.isArray(r.lap_times) && r.lap_times.length > 0);
  const title = heatMeta.heatNumber
    ? `HAKAFAST — Heat #${heatMeta.heatNumber}`
    : 'HAKAFAST Results';
  const rowsHtml = sorted.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.kart_number ?? ''}</td>
      <td>${String(r.driver_name || '').replace(/</g, '&lt;')}</td>
      <td>${r.driver_level || ''}</td>
      <td>${r.last_lap_time || ''}</td>
      <td>${r.best_lap_time || ''}</td>
      <td>${r.lap_count || 0}</td>
      ${hasLapHistory ? `<td class="laps">${(r.lap_times || []).join(' · ') || '—'}</td>` : ''}
    </tr>`).join('');
  const lapHeader = hasLapHistory ? '<th>All laps</th>' : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;color:#000080}
h1{margin:0 0 8px}p.meta{color:#64748b;margin:0 0 16px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #cbd5e0;padding:8px;text-align:center}
th{background:#000080;color:#fff}
td.laps{text-align:start;font-size:0.85em}
@media print{body{padding:12px}}
</style></head><body>
<h1>${title}</h1>
<p class="meta">${heatMeta.heatType || 'time'} · ${heatMeta.exportedAt || new Date().toISOString()}</p>
<table><thead><tr>
<th>#</th><th>Kart</th><th>Driver</th><th>Level</th><th>Last</th><th>Best</th><th>Laps</th>${lapHeader}
</tr></thead><tbody>${rowsHtml}</tbody></table>
</body></html>`;
}

function exportHeatResultsToFolder(store, options = {}) {
  ensureDataDirs();
  const dir = options.exportDir || getExportsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const heatNumber = options.heatNumber ?? null;
  const results = options.results || store.currentHeat || [];
  const heatType = options.heatType || store.heatSettings?.type || 'time';
  const exportCsv = options.exportCsv !== false;
  const exportPdf = Boolean(options.exportPdf);
  const exportedAt = new Date().toISOString();
  const slug = timestampSlug(options.at ? new Date(options.at) : new Date());
  const base = heatNumber ? `heat_${heatNumber}_${slug}` : `heat_${slug}`;
  const meta = { heatNumber, heatType, exportedAt };

  const out = { exportDir: dir };

  if (exportCsv) {
    const csvPath = path.join(dir, `${base}.csv`);
    fs.writeFileSync(csvPath, buildCsvRows(results, meta), 'utf8');
    out.csvPath = csvPath;
  }

  const metaPath = path.join(dir, `${base}.json`);
  fs.writeFileSync(metaPath, JSON.stringify({ ...meta, results }, null, 2), 'utf8');
  out.metaPath = metaPath;

  if (exportPdf) {
    const pdfPath = path.join(dir, `${base}_report.html`);
    fs.writeFileSync(pdfPath, buildPdfHtml(results, { ...meta, exportedAt }), 'utf8');
    out.pdfPath = pdfPath;
  }

  return out;
}

module.exports = {
  exportHeatResultsToFolder,
  buildCsvRows,
  buildPdfHtml,
};
