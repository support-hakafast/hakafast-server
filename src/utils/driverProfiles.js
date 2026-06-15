/**
 * Driver profiles system — remembers drivers per track for quick re-selection.
 * Profiles live in demo state under `driverProfiles` (keyed by track slug).
 */

const STORE_KEY_PREFIX = 'hf_driver_profiles_';

export function getDriverProfiles(trackSlug) {
  if (!trackSlug) return {};
  try {
    const raw = sessionStorage.getItem(STORE_KEY_PREFIX + trackSlug);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveDriverProfile(trackSlug, driver) {
  if (!trackSlug || !driver?.name?.trim()) return;
  const profiles = getDriverProfiles(trackSlug);
  const key = driver.name.trim().toLowerCase();
  const existing = profiles[key];
  const merged = {
    name: driver.name.trim(),
    weightKg: driver.weightKg != null ? Number(driver.weightKg) : (existing?.weightKg || null),
    nationality: driver.nationality || existing?.nationality || '',
    phone: driver.phone || existing?.phone || '',
    email: driver.email || existing?.email || '',
    level: driver.level || existing?.level || '',
    lastSeen: Date.now(),
    firstSeen: existing?.firstSeen || Date.now(),
    appearanceCount: (existing?.appearanceCount || 0) + 1,
    lastKartNumber: driver.kartNumber || existing?.lastKartNumber || null,
  };
  profiles[key] = merged;
  try {
    sessionStorage.setItem(STORE_KEY_PREFIX + trackSlug, JSON.stringify(profiles));
  } catch { /* quota exceeded, ignore */ }
  return merged;
}

export function saveDriverProfilesBatch(trackSlug, drivers) {
  if (!trackSlug || !Array.isArray(drivers)) return;
  drivers.forEach((d) => saveDriverProfile(trackSlug, d));
}

export function findDriverProfile(trackSlug, query) {
  if (!trackSlug || !query) return null;
  const profiles = getDriverProfiles(trackSlug);
  const q = query.trim().toLowerCase();
  if (profiles[q]) return profiles[q];
  // Fuzzy match: find by partial name
  const keys = Object.keys(profiles);
  for (const key of keys) {
    if (key.includes(q) || q.includes(key)) return profiles[key];
  }
  return null;
}

export function searchDriverProfiles(trackSlug, query, limit = 10) {
  if (!trackSlug || !query) return [];
  const profiles = getDriverProfiles(trackSlug);
  const q = query.trim().toLowerCase();
  const entries = Object.entries(profiles);
  const scored = entries
    .map(([key, profile]) => {
      let score = 0;
      if (key === q) score = 100;
      else if (key.startsWith(q)) score = 80;
      else if (key.includes(q)) score = 50;
      else if (q.length > 2 && key.includes(q.slice(0, 3))) score = 20;
      // Boost by appearance count
      score += Math.min(profile.appearanceCount || 0, 20);
      return { profile, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ profile }) => profile);
  return scored;
}

export function getAllDriverNames(trackSlug) {
  const profiles = getDriverProfiles(trackSlug);
  return Object.values(profiles)
    .sort((a, b) => (b.appearanceCount || 0) - (a.appearanceCount || 0))
    .map((d) => d.name);
}

export function getDriverProfileSuggestions(trackSlug) {
  const profiles = getDriverProfiles(trackSlug);
  return Object.values(profiles)
    .sort((a, b) => (b.appearanceCount || 0) - (a.appearanceCount || 0))
    .slice(0, 30)
    .map((d) => ({
      name: d.name,
      weightKg: d.weightKg,
      nationality: d.nationality,
      level: d.level,
    }));
}

export function normalizeProfileDriver(raw) {
  if (!raw || typeof raw !== 'object') return { name: '', weightKg: null, starter: false, nationality: '' };
  return {
    name: String(raw.name || '').trim(),
    weightKg: raw.weightKg != null ? Number(raw.weightKg) : null,
    starter: Boolean(raw.starter),
    nationality: String(raw.nationality || '').trim().toUpperCase().slice(0, 2) || '',
    phone: String(raw.phone || '').trim(),
    email: String(raw.email || '').trim(),
    level: String(raw.level || '').trim(),
  };
}

export function clearDriverProfiles(trackSlug) {
  try {
    sessionStorage.removeItem(STORE_KEY_PREFIX + trackSlug);
  } catch { /* ignore */ }
}

export function exportDriverProfilesCsv(trackSlug) {
  const profiles = getDriverProfiles(trackSlug);
  const entries = Object.values(profiles).sort((a, b) => (b.appearanceCount || 0) - (a.appearanceCount || 0));
  const header = 'name,weight_kg,nationality,phone,email,level,appearances,last_kart';
  const rows = entries.map((d) =>
    [
      `"${(d.name || '').replace(/"/g, '""')}"`,
      d.weightKg ?? '',
      d.nationality || '',
      d.phone || '',
      d.email || '',
      d.level || '',
      d.appearanceCount || 0,
      d.lastKartNumber ?? '',
    ].join(','),
  );
  return [header, ...rows].join('\n');
}