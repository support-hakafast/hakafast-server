/** HAKAFAST pricing — single source (ILS, before VAT). */
export const PRICING = {
  license: {
    Standard: { karts: 'עד 15', minKarts: 1, maxKarts: 15, price: 28000 },
    Pro: { karts: '16–25', minKarts: 16, maxKarts: 25, price: 42000 },
    Enterprise: { karts: '26+', minKarts: 26, maxKarts: null, price: 58000 },
  },
  services: {
    install: 8500,
    trainingDay: 4500,
  },
  /** HAKAFAST Care Plan — annual support (ILS, before VAT). Replaces %-of-license support. */
  carePlan: {
    Standard: 6000,
    Pro: 9000,
    Enterprise: 12000,
  },
  /** One-day event license (championship / corporate day). */
  eventDayRental: 2500,
  partnerMarginPct: 0.18,
  addons: {
    liveScreen: 3500,
    reception: 2000,
    rentix: 4500,
    paymentKiosk: 5500,
    travel: 2500,
  },
  upgrade: {
    'Standard→Pro': 14000,
    'Pro→Enterprise': 16000,
    'Standard→Enterprise': 30000,
  },
  vat: 0.18,
};

export const TIER_ORDER = ['Standard', 'Pro', 'Enterprise'];

export function formatIls(n) {
  return `₪${Number(n).toLocaleString('he-IL')}`;
}

/** Required license tier for a kart fleet size (cannot pick a lower tier). */
export function tierForKartCount(count) {
  const n = Math.max(1, Number(count) || 0);
  if (n <= PRICING.license.Standard.maxKarts) return 'Standard';
  if (n <= PRICING.license.Pro.maxKarts) return 'Pro';
  return 'Enterprise';
}

export function nextTier(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

export function upgradeCost(fromTier, toTier) {
  if (!fromTier || !toTier || fromTier === toTier) return null;
  return PRICING.upgrade[`${fromTier}→${toTier}`] ?? null;
}

export function upgradeCostToNext(tier) {
  const target = nextTier(tier);
  return target ? upgradeCost(tier, target) : null;
}

export function carePlanYearly(tier) {
  return PRICING.carePlan[tier] || 0;
}

/** @deprecated use carePlanYearly — kept for backward compatibility */
export function supportYearly(tier) {
  return carePlanYearly(tier);
}

export function partnerInstallMargin() {
  return Math.round(PRICING.services.install * PRICING.partnerMarginPct);
}

export function quoteTotal(tier, options = {}) {
  const includeCarePlan = typeof options === 'boolean' ? options : Boolean(options.includeCarePlan);
  const addons = typeof options === 'object' && options.addons ? options.addons : {};
  const lic = PRICING.license[tier]?.price || 0;
  const sub = lic + PRICING.services.install + PRICING.services.trainingDay;
  const addonTotal = Object.entries(addons).reduce((sum, [key, on]) => {
    if (!on) return sum;
    return sum + (PRICING.addons[key] || 0);
  }, 0);
  const carePlan = includeCarePlan ? carePlanYearly(tier) : 0;
  const beforeVat = sub + addonTotal + carePlan;
  const vat = Math.round(beforeVat * PRICING.vat);
  return {
    sub,
    addons: addonTotal,
    carePlan,
    support: carePlan,
    beforeVat,
    vat,
    total: beforeVat + vat,
  };
}

export const INSTALL_STEPS = [
  { id: 'prep', titleKey: 'install_step_prep', durationKey: 'install_step_prep_time', detailKey: 'install_step_prep_detail' },
  { id: 'software', titleKey: 'install_step_software', durationKey: 'install_step_software_time', detailKey: 'install_step_software_detail' },
  { id: 'tranx', titleKey: 'install_step_tranx', durationKey: 'install_step_tranx_time', detailKey: 'install_step_tranx_detail' },
  { id: 'screens', titleKey: 'install_step_screens', durationKey: 'install_step_screens_time', detailKey: 'install_step_screens_detail' },
  { id: 'training', titleKey: 'install_step_training', durationKey: 'install_step_training_time', detailKey: 'install_step_training_detail' },
  { id: 'golive', titleKey: 'install_step_golive', durationKey: 'install_step_golive_time', detailKey: 'install_step_golive_detail' },
];
