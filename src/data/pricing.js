/** HAKAFAST pricing — single source (ILS, before VAT). */
export const PRICING = {
  license: {
    Standard: { karts: 'עד 15', price: 28000 },
    Pro: { karts: '16–25', price: 42000 },
    Enterprise: { karts: '26+', price: 58000 },
  },
  services: {
    install: 8500,
    trainingDay: 4500,
  },
  supportPct: 0.18,
  addons: {
    liveScreen: 3500,
    reception: 2000,
    rentix: 4500,
    travel: 2500,
  },
  upgrade: {
    'Standard→Pro': 14000,
    'Pro→Enterprise': 16000,
    'Standard→Enterprise': 30000,
  },
  vat: 0.18,
};

export function formatIls(n) {
  return `₪${Number(n).toLocaleString('he-IL')}`;
}

export function supportYearly(tier) {
  const price = PRICING.license[tier]?.price || 0;
  return Math.round(price * PRICING.supportPct);
}

export function quoteTotal(tier, includeSupport = false) {
  const lic = PRICING.license[tier]?.price || 0;
  const sub = lic + PRICING.services.install + PRICING.services.trainingDay;
  const support = includeSupport ? supportYearly(tier) : 0;
  const beforeVat = sub + support;
  const vat = Math.round(beforeVat * PRICING.vat);
  return { sub, support, beforeVat, vat, total: beforeVat + vat };
}

export const INSTALL_STEPS = [
  { id: 'prep', titleKey: 'install_step_prep', durationKey: 'install_step_prep_time', detailKey: 'install_step_prep_detail' },
  { id: 'software', titleKey: 'install_step_software', durationKey: 'install_step_software_time', detailKey: 'install_step_software_detail' },
  { id: 'tranx', titleKey: 'install_step_tranx', durationKey: 'install_step_tranx_time', detailKey: 'install_step_tranx_detail' },
  { id: 'screens', titleKey: 'install_step_screens', durationKey: 'install_step_screens_time', detailKey: 'install_step_screens_detail' },
  { id: 'training', titleKey: 'install_step_training', durationKey: 'install_step_training_time', detailKey: 'install_step_training_detail' },
  { id: 'golive', titleKey: 'install_step_golive', durationKey: 'install_step_golive_time', detailKey: 'install_step_golive_detail' },
];
