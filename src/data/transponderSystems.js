/**
 * Common kart / motorsport timing systems used worldwide.
 * HAKAFAST native integration: MYLAPS P3 (TranX 160/260/Pro, X2 via converter).
 * Other systems: map transponder IDs in the event planner; passings via webhook/converter.
 */
export const TRANSPONDER_SYSTEMS = [
  {
    id: 'mylaps_tranx',
    name: 'MYLAPS TranX 160 / 260 / Pro',
    vendor: 'MYLAPS',
    region: 'global',
    protocol: 'p3',
    integration: 'native',
    idFormat: '8-digit numeric',
    idExample: '12345678',
    port: 5403,
    transponders: ['TranX2', 'TranX Pro', 'Flex', 'Smarty'],
  },
  {
    id: 'mylaps_x2',
    name: 'MYLAPS X2 System',
    vendor: 'MYLAPS',
    region: 'global',
    protocol: 'p3',
    integration: 'converter',
    idFormat: '8-digit numeric',
    idExample: '87654321',
    port: 5403,
    transponders: ['TR2 Kart', 'X2 Transponder', 'X2 Driver ID'],
  },
  {
    id: 'mylaps_rental',
    name: 'MYLAPS Rental Kart (TranX140)',
    vendor: 'MYLAPS',
    region: 'global',
    protocol: 'p3',
    integration: 'native',
    idFormat: '8-digit numeric',
    idExample: '40123456',
    port: 5403,
    transponders: ['TranX140', 'Active Loop'],
  },
  {
    id: 'race_result',
    name: 'RACE RESULT Ubidium',
    vendor: 'RACE RESULT',
    region: 'europe',
    protocol: 'race_result',
    integration: 'webhook',
    idFormat: 'alphanumeric chip ID',
    idExample: 'RR-88421',
    port: null,
    transponders: ['MotorKart V3', 'Active Loop Box'],
  },
  {
    id: 'chronelec',
    name: 'Chronelec Protime',
    vendor: 'Chronelec',
    region: 'europe',
    protocol: 'chronelec',
    integration: 'export',
    idFormat: 'numeric',
    idExample: '4521',
    port: null,
    transponders: ['Protime transponder'],
  },
  {
    id: 'apex',
    name: 'Apex Timing',
    vendor: 'Apex Timing',
    region: 'europe',
    protocol: 'third_party',
    integration: 'export',
    idFormat: 'varies',
    idExample: '—',
    port: null,
    transponders: ['MYLAPS TR2', 'RACE RESULT MotorKart'],
  },
  {
    id: 'alfano',
    name: 'Alfano Pro',
    vendor: 'Alfano',
    region: 'europe',
    protocol: 'alfano',
    integration: 'manual',
    idFormat: 'device serial',
    idExample: 'ALF-9921',
    port: null,
    transponders: ['Alfano Pro transponder'],
  },
  {
    id: 'aim',
    name: 'AiM MyChron / SmartyCam',
    vendor: 'AiM Sports',
    region: 'global',
    protocol: 'telemetry',
    integration: 'manual',
    idFormat: 'device ID',
    idExample: '—',
    port: null,
    transponders: ['MyChron', 'SmartyCam'],
  },
  {
    id: 'manual',
    name: 'Manual / No transponder',
    vendor: null,
    region: 'global',
    protocol: 'none',
    integration: 'manual',
    idFormat: '—',
    idExample: '—',
    port: null,
    transponders: [],
  },
];

export function getTransponderSystem(id) {
  return TRANSPONDER_SYSTEMS.find((s) => s.id === id) || TRANSPONDER_SYSTEMS[0];
}

export function isNativeTransponderSystem(id) {
  const sys = getTransponderSystem(id);
  return sys.integration === 'native';
}

export function normalizeTransponderId(raw, systemId) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const sys = getTransponderSystem(systemId);
  if (sys.protocol === 'p3') {
    const digits = value.replace(/\D/g, '');
    return digits || value;
  }
  return value;
}
