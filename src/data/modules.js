/**
 * HAKAFAST module catalog — single source for tiers, quote add-ons, and usage guides.
 *
 * includedIn: true = bundled in license tier | false = not available | 'addon' = optional purchase
 *
 * Categories:
 * - core: timing & ops (always local/offline)
 * - hardware: decoder/transponder connection (software side; physical gear via partner)
 * - operations: day-to-day track workflows
 * - booking: reservations (Rentix = external booking sync, NOT timing hardware)
 * - payment: checkout module (requires payment provider setup)
 */

import { PRICING } from './pricing.js';

export const MODULE_CATEGORIES = ['core', 'hardware', 'operations', 'booking', 'payment'];

export const MODULES = [
  {
    id: 'core_timing',
    category: 'core',
    nameKey: 'mod_core_timing_name',
    descKey: 'mod_core_timing_desc',
    includedIn: { Standard: true, Pro: true, Enterprise: true },
    guideSteps: ['mod_guide_core_1', 'mod_guide_core_2', 'mod_guide_core_3', 'mod_guide_core_4'],
    tryRoute: '/admin/kart-demo',
  },
  {
    id: 'decoder_tranx',
    category: 'hardware',
    nameKey: 'mod_decoder_name',
    descKey: 'mod_decoder_desc',
    includedIn: { Standard: true, Pro: true, Enterprise: true },
    hardwareNoteKey: 'mod_decoder_hardware_note',
    guideSteps: [
      'mod_guide_decoder_1',
      'mod_guide_decoder_2',
      'mod_guide_decoder_3',
      'mod_guide_decoder_4',
      'mod_guide_decoder_5',
    ],
    tryRoute: '/admin/kart-demo',
  },
  {
    id: 'reception',
    category: 'operations',
    nameKey: 'mod_reception_name',
    descKey: 'mod_reception_desc',
    includedIn: { Standard: true, Pro: true, Enterprise: true },
    guideSteps: ['mod_guide_reception_1', 'mod_guide_reception_2', 'mod_guide_reception_3'],
    tryRoute: '/reception/kart-demo',
  },
  {
    id: 'live_screens',
    category: 'core',
    nameKey: 'mod_live_screens_name',
    descKey: 'mod_live_screens_desc',
    includedIn: { Standard: true, Pro: true, Enterprise: true },
    addonKey: 'liveScreen',
    addonNoteKey: 'mod_live_screens_addon_note',
    guideSteps: ['mod_guide_live_1', 'mod_guide_live_2'],
    tryRoute: '/live-timing/kart-demo',
  },
  {
    id: 'results_qr',
    category: 'operations',
    nameKey: 'mod_results_qr_name',
    descKey: 'mod_results_qr_desc',
    includedIn: { Standard: true, Pro: true, Enterprise: true },
    guideSteps: ['mod_guide_results_1', 'mod_guide_results_2', 'mod_guide_results_3'],
    tryRoute: '/results',
  },
  {
    id: 'busy_day',
    category: 'operations',
    nameKey: 'mod_busy_day_name',
    descKey: 'mod_busy_day_desc',
    includedIn: { Standard: false, Pro: true, Enterprise: true },
    guideSteps: ['mod_guide_busy_1', 'mod_guide_busy_2', 'mod_guide_busy_3', 'mod_guide_busy_4'],
    tryRoute: '/admin/kart-demo',
  },
  {
    id: 'day_planner',
    category: 'operations',
    nameKey: 'mod_day_planner_name',
    descKey: 'mod_day_planner_desc',
    includedIn: { Standard: false, Pro: true, Enterprise: true },
    guideSteps: ['mod_guide_planner_1', 'mod_guide_planner_2', 'mod_guide_planner_3'],
    tryRoute: '/admin/kart-demo',
  },
  {
    id: 'bookings_kiosk',
    category: 'booking',
    nameKey: 'mod_bookings_name',
    descKey: 'mod_bookings_desc',
    includedIn: { Standard: false, Pro: true, Enterprise: true },
    guideSteps: ['mod_guide_bookings_1', 'mod_guide_bookings_2', 'mod_guide_bookings_3'],
    tryRoute: '/embed/booking/kart-demo',
  },
  {
    id: 'pro_events',
    category: 'operations',
    nameKey: 'mod_pro_events_name',
    descKey: 'mod_pro_events_desc',
    includedIn: { Standard: false, Pro: true, Enterprise: true },
    guideSteps: ['mod_guide_pro_1', 'mod_guide_pro_2'],
    tryRoute: '/admin/kart-demo',
  },
  {
    id: 'championship',
    category: 'operations',
    nameKey: 'mod_championship_name',
    descKey: 'mod_championship_desc',
    includedIn: { Standard: false, Pro: true, Enterprise: true },
    guideSteps: ['mod_guide_champ_1', 'mod_guide_champ_2', 'mod_guide_champ_3'],
    tryRoute: '/championship',
  },
  {
    id: 'rentix_sync',
    category: 'booking',
    nameKey: 'mod_rentix_name',
    descKey: 'mod_rentix_desc',
    includedIn: { Standard: 'addon', Pro: 'addon', Enterprise: 'addon' },
    addonKey: 'rentix',
    salesVisible: false,
    notHardwareKey: 'mod_rentix_not_hardware',
    guideSteps: ['mod_guide_rentix_1', 'mod_guide_rentix_2', 'mod_guide_rentix_3'],
    tryRoute: null,
  },
  {
    id: 'payment_kiosk',
    category: 'payment',
    nameKey: 'mod_payment_name',
    descKey: 'mod_payment_desc',
    includedIn: { Standard: 'addon', Pro: 'addon', Enterprise: 'addon' },
    addonKey: 'paymentKiosk',
    demoRoute: '/demo/payment',
    guideSteps: ['mod_guide_payment_1', 'mod_guide_payment_2', 'mod_guide_payment_3', 'mod_guide_payment_4'],
    tryRoute: '/demo/payment',
  },
  {
    id: 'hardware_supply',
    category: 'hardware',
    nameKey: 'mod_hardware_supply_name',
    descKey: 'mod_hardware_supply_desc',
    includedIn: { Standard: 'partner', Pro: 'partner', Enterprise: 'partner' },
    hardwareNoteKey: 'mod_hardware_supply_note',
    guideSteps: ['mod_guide_supply_1', 'mod_guide_supply_2', 'mod_guide_supply_3'],
    tryRoute: null,
  },
];

/** Visible on /modules and /quote (sales/marketing). */
export function isSalesVisible(mod) {
  return mod.salesVisible !== false;
}

export const CATALOG_MODULES = MODULES.filter(isSalesVisible);

export function getModule(id) {
  return MODULES.find((m) => m.id === id) || null;
}

/** Hardware modules shown in highlight box (order preserved). */
export const HARDWARE_HIGHLIGHT_IDS = ['decoder_tranx', 'hardware_supply'];

export function getHardwareHighlightModules() {
  return HARDWARE_HIGHLIGHT_IDS.map((id) => getModule(id)).filter(Boolean);
}

/** Modules bundled in tier (includedIn === true). */
export function modulesIncludedInTier(tier) {
  return MODULES.filter((m) => m.includedIn[tier] === true);
}

/** Optional add-on modules for tier (includedIn === 'addon'). */
export function modulesAvailableAsAddons(tier) {
  return MODULES.filter((m) => m.includedIn[tier] === 'addon' && m.addonKey && isSalesVisible(m));
}

export function moduleInclusionLabel(module, tier) {
  const v = module.includedIn[tier];
  if (v === true) return 'included';
  if (v === 'addon') return 'addon';
  if (v === 'partner') return 'partner';
  return 'upgrade';
}

/** Add-on modules with checkboxes on quote page. */
export const QUOTE_ADDON_MODULES = MODULES.filter((m) => m.addonKey && isSalesVisible(m));

export function addonPrice(addonKey) {
  return PRICING.addons[addonKey] || 0;
}
