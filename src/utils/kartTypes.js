import { parseKartNumbers } from './adminHelpers.js';

export const DEFAULT_KART_TYPE_PRESETS = [
  { id: 'kart-type-1', name: 'SODI RX8', engineCc: '270', color: '#dc2626' },
  { id: 'kart-type-2', name: 'SODI RX8', engineCc: '390', color: '#2563eb' },
];

const FALLBACK_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777'];

export function sanitizeKartColor(hex, fallbackIndex = 0) {
  const fallback = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return fallback;
  return hex.toLowerCase();
}

/** @deprecated White is allowed; kept for callers that still import it. */
export function isDisallowedKartColor() {
  return false;
}

export function formatEngineCc(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return /cc$/i.test(s) ? s : `${s}cc`;
}

export function formatKartTypeLabel(type) {
  if (!type) return '';
  const name = (type.name || '').trim();
  const engine = formatEngineCc(type.engineCc);
  if (name && engine) return `${name} · ${engine}`;
  return name || engine || '';
}

export function isLightKartColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 200;
}

export function normalizeKartTypes(raw) {
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

export function createEmptyKartType(index = 0) {
  return {
    id: `kart-type-${Date.now()}-${index}`,
    name: '',
    engineCc: '',
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
  if (!multipleKartTypes || !kartTypes.length) {
    const nums = parseKartNumbers(singleInput);
    return {
      assignments: nums.map((num) => ({ num, modelId: null })),
      conflicts: [],
    };
  }

  const seen = new Map();
  const assignments = [];
  const conflicts = [];

  kartTypes.forEach((type) => {
    const nums = parseKartNumbers(kartNumbersByType?.[type.id] || '');
    nums.forEach((num) => {
      if (seen.has(num)) {
        if (!conflicts.includes(num)) conflicts.push(num);
      } else {
        seen.set(num, type.id);
        assignments.push({ num, modelId: type.id });
      }
    });
  });

  return { assignments, conflicts };
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
      if (!map.has(num)) map.set(num, type.id);
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
