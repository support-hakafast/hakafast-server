export const DEFAULT_KART_TYPE_PRESETS = [
  { id: 'kart-type-1', name: 'SODI RX8', color: '#dc2626' },
  { id: 'kart-type-2', name: 'SODI SR4', color: '#2563eb' },
];

export function normalizeKartTypes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t, i) => ({
      id: (typeof t?.id === 'string' && t.id.trim()) ? t.id.trim() : `kart-type-${i + 1}`,
      name: (typeof t?.name === 'string' && t.name.trim()) ? t.name.trim().slice(0, 48) : '',
      color: /^#[0-9a-fA-F]{6}$/.test(t?.color) ? t.color : '#64748b',
    }))
    .filter((t) => t.name);
}

export function createEmptyKartType(index = 0) {
  return {
    id: `kart-type-${Date.now()}-${index}`,
    name: '',
    color: '#64748b',
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
