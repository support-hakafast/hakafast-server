export function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [h, m] = value.split(':').map((part) => parseInt(part, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function calculateDayPlan(profile, options = {}) {
  const p = profile || {};
  const openMin = parseTimeToMinutes(p.openingTime);
  const closeMin = parseTimeToMinutes(p.closingTime);
  const sessionDurationMin = Math.max(1, Number(p.sessionDurationMin) || 10);
  const competitiveBlockMin = Math.max(1, Number(p.competitiveBlockMin) || 45);
  const turnoverMin = Math.max(0, Number(p.turnoverMin) || 0);
  const pricePerSession = Math.max(0, Number(p.pricePerSession) || 0);
  const competitiveHeats = Math.max(0, Number(options.competitiveHeats) || 0);

  if (openMin == null || closeMin == null || closeMin <= openMin) {
    return {
      openMinutes: 0,
      maxSessionHeats: 0,
      maxSessionHeatsAfterCompetitive: 0,
      estimatedRevenue: 0,
      estimatedRevenueAfterCompetitive: 0,
    };
  }

  const openMinutes = closeMin - openMin;
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
    estimatedRevenue: maxSessionHeats * pricePerSession,
    estimatedRevenueAfterCompetitive: maxSessionHeatsAfterCompetitive * pricePerSession,
  };
}
