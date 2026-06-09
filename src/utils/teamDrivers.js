/** Normalize team driver entries to display names. */
export function formatDriverName(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry === 'object') {
    return String(entry.name || entry.driver_name || entry.full_name || '').trim();
  }
  return String(entry).trim();
}

export function formatTeamDriversList(raw, separator = ' · ') {
  if (!Array.isArray(raw) || !raw.length) return '';
  return raw.map(formatDriverName).filter(Boolean).join(separator);
}

export function normalizeTeamDriversArray(raw) {
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map((d) => ({
    name: formatDriverName(d),
    transponder_id: typeof d === 'object' && d?.transponder_id ? String(d.transponder_id) : null,
  })).filter((d) => d.name);
}
