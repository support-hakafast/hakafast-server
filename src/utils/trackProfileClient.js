export function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [h, m] = value.split(':').map((part) => parseInt(part, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Minutes the track is open; supports closing after midnight (e.g. 08:00 → 00:00). */
export function getOperatingWindowMinutes(openMin, closeMin) {
  if (openMin == null || closeMin == null) return null;
  if (closeMin > openMin) return closeMin - openMin;
  if (closeMin === openMin) return 24 * 60;
  return (24 * 60 - openMin) + closeMin;
}

export function calculateDayPlan(profile, options = {}) {
  const p = profile || {};
  const openMin = parseTimeToMinutes(p.openingTime);
  const closeMin = parseTimeToMinutes(p.closingTime);
  const sessionDurationMin = Math.max(1, Number(p.sessionDurationMin) || 10);
  const competitiveBlockMin = Math.max(1, Number(p.competitiveBlockMin) || 45);
  const turnoverMin = Math.max(0, Number(p.turnoverMin) || 0);
  const avgDrivers = Math.max(1, Number(p.avgDriversPerSession) || 8);
  const pricePerDriver = Math.max(0, Number(p.pricePerSession) || 0);
  const competitiveHeats = Math.max(0, Number(options.competitiveHeats) || 0);

  const openMinutes = getOperatingWindowMinutes(openMin, closeMin);
  if (openMinutes == null) {
    return {
      openMinutes: 0,
      maxSessionHeats: 0,
      maxSessionHeatsAfterCompetitive: 0,
      avgDriversPerSession: avgDrivers,
      estimatedRiders: 0,
      estimatedRidersAfterCompetitive: 0,
      estimatedRevenue: 0,
      estimatedRevenueAfterCompetitive: 0,
    };
  }

  const sessionSlotMin = sessionDurationMin + turnoverMin;
  const competitiveSlotMin = competitiveBlockMin + turnoverMin;
  const maxSessionHeats = Math.floor(openMinutes / sessionSlotMin);
  const competitiveReserveMin = competitiveHeats * competitiveSlotMin;
  const remainingForSessionsMin = Math.max(0, openMinutes - competitiveReserveMin);
  const maxSessionHeatsAfterCompetitive = Math.floor(remainingForSessionsMin / sessionSlotMin);

  return {
    openMinutes,
    sessionSlotMin,
    competitiveSlotMin,
    maxSessionHeats,
    competitiveReserveMin,
    remainingForSessionsMin,
    maxSessionHeatsAfterCompetitive,
    avgDriversPerSession: avgDrivers,
    estimatedRiders: maxSessionHeats * avgDrivers,
    estimatedRidersAfterCompetitive: maxSessionHeatsAfterCompetitive * avgDrivers,
    estimatedRevenue: maxSessionHeats * avgDrivers * pricePerDriver,
    estimatedRevenueAfterCompetitive: maxSessionHeatsAfterCompetitive * avgDrivers * pricePerDriver,
  };
}
