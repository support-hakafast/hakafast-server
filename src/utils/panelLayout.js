const GAP = 20;

export const PANEL_SIZES = {
  heat: { width: 440, height: 320 },
  warehouse: { width: 360, height: 400 },
  pits: { width: 640, height: 540 },
  drivers: { width: 400, height: 680 },
  editLevel: { width: 400, height: 500 },
};

export function computeInitialLayout(viewportWidth = 1400) {
  const w = viewportWidth;
  const m = 16;
  const heatH = PANEL_SIZES.heat.height;
  const row2Y = 110 + heatH + GAP;

  const driversX = Math.max(m, w - PANEL_SIZES.drivers.width - m);
  const driversBottom = 110 + PANEL_SIZES.drivers.height;

  return {
    heat: { x: m, y: 110 },
    warehouse: { x: m, y: row2Y },
    pits: { x: m + PANEL_SIZES.warehouse.width + GAP, y: row2Y },
    drivers: { x: driversX, y: 110 },
    editLevel: { x: driversX, y: driversBottom + GAP },
  };
}

function panelRect(id, pos) {
  const size = PANEL_SIZES[id] || { width: 360, height: 300 };
  return {
    id,
    x: pos.x,
    y: pos.y,
    w: size.width,
    h: size.height,
  };
}

export function rectsOverlap(a, b, margin = GAP) {
  return !(
    a.x + a.w + margin <= b.x
    || b.x + b.w + margin <= a.x
    || a.y + a.h + margin <= b.y
    || b.y + b.h + margin <= a.y
  );
}

export function resolveCollisions(movedId, positions, viewportWidth, viewportHeight) {
  const next = { ...positions };
  const maxX = Math.max(0, viewportWidth - (PANEL_SIZES[movedId]?.width || 360) - 8);
  const maxY = Math.max(80, viewportHeight - 120);

  let rect = panelRect(movedId, next[movedId]);
  rect.x = Math.min(Math.max(8, rect.x), maxX);
  rect.y = Math.min(Math.max(80, rect.y), maxY);
  next[movedId] = { x: rect.x, y: rect.y };

  const ids = Object.keys(next);
  let safety = 0;
  while (safety < 80) {
    let hit = false;
    for (const otherId of ids) {
      if (otherId === movedId) continue;
      const other = panelRect(otherId, next[otherId]);
      if (rectsOverlap(rect, other)) {
        rect.y = other.y + other.h + GAP;
        if (rect.y + rect.h > viewportHeight - 40) {
          rect.x = other.x + other.w + GAP;
          rect.y = other.y;
        }
        next[movedId] = { x: rect.x, y: rect.y };
        hit = true;
        break;
      }
    }
    if (!hit) break;
    safety += 1;
  }

  next[movedId] = {
    x: Math.min(Math.max(8, rect.x), maxX),
    y: Math.min(Math.max(80, rect.y), maxY),
  };
  return next;
}

export function sanitizeStoredLayout(stored, viewportWidth, viewportHeight) {
  const base = computeInitialLayout(viewportWidth);
  const merged = { ...base, ...stored };
  let positions = { ...merged };
  const order = ['heat', 'warehouse', 'pits', 'drivers', 'editLevel'];
  order.forEach((id) => {
    if (positions[id]) {
      positions = resolveCollisions(id, positions, viewportWidth, viewportHeight);
    }
  });
  return positions;
}
