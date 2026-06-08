const fs = require('fs');
const path = require('path');
const { getExportsDir, ensureDataDirs } = require('./installConfig');

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestampSlug(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function buildCsvRows(results, heatMeta = {}) {
  const header = 'Position,Kart,Driver,Level,Last Lap,Best Lap,Laps';
  const lines = [header];
  const sorted = (results || []).slice().sort((a, b) => {
    const aBest = a.best_lap_time || '99:99.999';
    const bBest = b.best_lap_time || '99:99.999';
    return aBest.localeCompare(bBest);
  });
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

function exportHeatResultsToFolder(store, options = {}) {
  ensureDataDirs();
  const dir = options.exportDir || getExportsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const heatNumber = options.heatNumber ?? null;
  const results = options.results || store.currentHeat || [];
  const heatType = options.heatType || store.heatSettings?.type || 'time';
  const slug = timestampSlug(options.at ? new Date(options.at) : new Date());
  const base = heatNumber ? `heat_${heatNumber}_${slug}` : `heat_${slug}`;
  const csvPath = path.join(dir, `${base}.csv`);
  const csv = buildCsvRows(results, { heatNumber, heatType });
  fs.writeFileSync(csvPath, csv, 'utf8');

  const metaPath = path.join(dir, `${base}.json`);
  fs.writeFileSync(metaPath, JSON.stringify({
    heatNumber,
    heatType,
    exportedAt: new Date().toISOString(),
    results,
  }, null, 2), 'utf8');

  return { csvPath, metaPath, exportDir: dir };
}

module.exports = {
  exportHeatResultsToFolder,
  buildCsvRows,
};
