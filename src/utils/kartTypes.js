import { parseKartNumbers } from './adminHelpers.js';

export const DEFAULT_KART_TYPE_PRESETS = [
  { id: 'kart-type-1', name: 'SODI RX8', color: '#dc2626' },
  { id: 'kart-type-2', name: 'SODI SR4', color: '#2563eb' },
];

const FALLBACK_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777'];

export function isDisallowedKartColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return true;
  const h = hex.slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return true;
  return r >= 242 && g >= 242 && b >= 242;
}

export function sanitizeKartColor(hex, fallbackIndex = 0) {
  const fallback = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return fallback;
  if (isDisallowedKartColor(hex)) return fallback;
  return hex.toLowerCase();
}

export function normalizeKartTypes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t, i) => ({
      id: (typeof t?.id === 'string' && t.id.trim()) ? t.id.trim() : `kart-type-${i + 1}`,
      name: (typeof t?.name === 'string' && t.name.trim()) ? t.name.trim().slice(0, 48) : '',
      color: sanitizeKartColor(t?.color, i),
    }))
    .filter((t) => t.name);
}

export function createEmptyKartType(index = 0) {
  return {
    id: `kart-type-${Date.now()}-${index}`,
    name: '',
    color: sanitizeKartColor('', index),
  };
}

export function getKartTypeById(kartTypes, modelId) {
  if (!modelId || !Array.isArray(kartTypes)) return null;
  return kartTypes.find((t) => t.id === modelId) || null;
}

export function resolveKartModelColor(kart, kartTypes) {
  const type = getKartTypeById(kartTypes, kart?.modelId);
  return type?.color || null;
}

export function collectKartAssignments(multipleKartTypes, kartTypes, kartNumbersByType, singleInput = '') {
  if (multipleKartTypes && kartTypes.length > 0) {
    const assignments = [];
    kartTypes.forEach((type) => {
      const nums = parseKartNumbers(kartNumbersByType?.[type.id] || '');
      nums.forEach((num) => assignments.push({ num, modelId: type.id }));
    });
    return assignments;
  }
  return parseKartNumbers(singleInput).map((num) => ({ num, modelId: null }));
}

export function joinKartNumbersForSetup(assignments) {
  return assignments.map((a) => String(a.num)).join(', ');
}

/** Map kart number → model id from per-type number fields. */
export function buildModelIdByNumber(kartTypes, kartNumbersByType) {
  const map = new Map();
  if (!Array.isArray(kartTypes)) return map;
  kartTypes.forEach((type) => {
    parseKartNumbers(kartNumbersByType?.[type.id] || '').forEach((num) => {
      map.set(Number(num), type.id);
    });
  });
  return map;
}

export function resolveKartModelId(kart, kartTypes, kartNumbersByType) {
  if (kart?.modelId && getKartTypeById(kartTypes, kart.modelId)) return kart.modelId;
  const map = buildModelIdByNumber(kartTypes, kartNumbersByType);
  const fromMap = map.get(Number(kart?.number ?? kart));
  return fromMap || null;
}
