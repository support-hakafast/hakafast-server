const DEFAULT_TRACK_PROFILE = {
  trackDisplayName: '',
  openingTime: '10:00',
  closingTime: '22:00',
  sessionDurationMin: 10,
  competitiveBlockMin: 45,
  turnoverMin: 5,
  avgDriversPerSession: 8,
  pricePerSession: 0,
  currency: 'ILS',
  multipleKartTypes: false,
  kartTypes: [],
  kartNumbersByType: {},
};

function sanitizeKartColor(hex, index = 0) {
  const palette = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777'];
  const fallback = palette[index % palette.length];
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return fallback;
  return hex.toLowerCase();
}

function normalizeKartTypes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t, i) => ({
      id: (typeof t?.id === 'string' && t.id.trim()) ? t.id.trim() : `kart-type-${i + 1}`,
      name: (typeof t?.name === 'string' && t.name.trim()) ? t.name.trim().slice(0, 48) : '',
      engineCc: (typeof t?.engineCc === 'string' && t.engineCc.trim())
        ? t.engineCc.trim().slice(0, 16)
        : (t?.engineCc != null ? String(t.engineCc).trim().slice(0, 16) : ''),
      color: sanitizeKartColor(t?.color, i),
    }))
    .filter((t) => t.name);
}

function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [h, m] = value.split(':').map((part) => parseInt(part, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function normalizeTrackProfile(raw, trackSlug = '') {
  const base = { ...DEFAULT_TRACK_PROFILE };
  if (!raw || typeof raw !== 'object') {
    if (trackSlug) base.trackDisplayName = trackSlug;
    return base;
  }
  if (typeof raw.trackDisplayName === 'string') base.trackDisplayName = raw.trackDisplayName;
  if (typeof raw.openingTime === 'string') base.openingTime = raw.openingTime;
  if (typeof raw.closingTime === 'string') base.closingTime = raw.closingTime;
  if (raw.sessionDurationMin != null) base.sessionDurationMin = Math.max(1, Number(raw.sessionDurationMin) || 10);
  if (raw.competitiveBlockMin != null) base.competitiveBlockMin = Math.max(1, Number(raw.competitiveBlockMin) || 45);
  if (raw.turnoverMin != null) base.turnoverMin = Math.max(0, Number(raw.turnoverMin) || 0);
  if (raw.avgDriversPerSession != null) {
    base.avgDriversPerSession = Math.max(1, Number(raw.avgDriversPerSession) || 8);
  }
  if (raw.pricePerSession != null) base.pricePerSession = Math.max(0, Number(raw.pricePerSession) || 0);
  if (typeof raw.currency === 'string' && raw.currency.trim()) base.currency = raw.currency.trim();
  if (typeof raw.multipleKartTypes === 'boolean') base.multipleKartTypes = raw.multipleKartTypes;
  if (Array.isArray(raw.kartTypes)) base.kartTypes = normalizeKartTypes(raw.kartTypes);
  if (raw.kartNumbersByType && typeof raw.kartNumbersByType === 'object') {
    base.kartNumbersByType = Object.fromEntries(
      Object.entries(raw.kartNumbersByType).map(([id, val]) => [id, String(val ?? '')]),
    );
  }
  if (base.multipleKartTypes && base.kartTypes.length < 2) {
    base.multipleKartTypes = false;
    base.kartTypes = [];
  }
  if (!base.trackDisplayName && trackSlug) base.trackDisplayName = trackSlug;
  return base;
}

function isSessionHeatType(type) {
  return (type || 'time') === 'time';
}

function isCompetitiveHeatType(type) {
  return type === 'sprint' || type === 'endurance';
}

function getOperatingWindowMinutes(openMin, closeMin) {
  if (openMin == null || closeMin == null) return null;
  if (closeMin > openMin) return closeMin - openMin;
  if (closeMin === openMin) return 24 * 60;
  return (24 * 60 - openMin) + closeMin;
}

function calculateDayPlan(profile, options = {}) {
  const p = normalizeTrackProfile(profile);
  const openMin = parseTimeToMinutes(p.openingTime);
  const closeMin = parseTimeToMinutes(p.closingTime);
  const competitiveHeats = Math.max(0, Number(options.competitiveHeats) || 0);

  const openMinutes = getOperatingWindowMinutes(openMin, closeMin);
  if (openMinutes == null) {
    return {
      openMinutes: 0,
      sessionSlotMin: p.sessionDurationMin + p.turnoverMin,
      competitiveSlotMin: p.competitiveBlockMin + p.turnoverMin,
      maxSessionHeats: 0,
      competitiveReserveMin: 0,
      remainingForSessionsMin: 0,
      maxSessionHeatsAfterCompetitive: 0,
      estimatedRevenue: 0,
      estimatedRevenueAfterCompetitive: 0,
      estimatedRiders: 0,
      estimatedRidersAfterCompetitive: 0,
    };
  }

  const sessionSlotMin = p.sessionDurationMin + p.turnoverMin;
  const competitiveSlotMin = p.competitiveBlockMin + p.turnoverMin;
  const maxSessionHeats = Math.floor(openMinutes / sessionSlotMin);
  const competitiveReserveMin = competitiveHeats * competitiveSlotMin;
  const remainingForSessionsMin = Math.max(0, openMinutes - competitiveReserveMin);
  const maxSessionHeatsAfterCompetitive = Math.floor(remainingForSessionsMin / sessionSlotMin);
  const avgDrivers = Math.max(1, Number(p.avgDriversPerSession) || 8);
  const pricePerDriver = Math.max(0, Number(p.pricePerSession) || 0);
  const estimatedRiders = maxSessionHeats * avgDrivers;
  const estimatedRidersAfterCompetitive = maxSessionHeatsAfterCompetitive * avgDrivers;

  return {
    openMinutes,
    sessionSlotMin,
    competitiveSlotMin,
    maxSessionHeats,
    competitiveReserveMin,
    remainingForSessionsMin,
    maxSessionHeatsAfterCompetitive,
    avgDriversPerSession: avgDrivers,
    estimatedRiders,
    estimatedRidersAfterCompetitive,
    estimatedRevenue: estimatedRiders * pricePerDriver,
    estimatedRevenueAfterCompetitive: estimatedRidersAfterCompetitive * pricePerDriver,
  };
}

module.exports = {
  DEFAULT_TRACK_PROFILE,
  normalizeTrackProfile,
  parseTimeToMinutes,
  isSessionHeatType,
  isCompetitiveHeatType,
  calculateDayPlan,
};
