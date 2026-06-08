const WORKSPACE_PREFIX = 'hf_workspace_';

export const DEMO_TRACK = 'kart-demo';

/** Tracks that use per-device isolated workspaces (demo + production sandboxes). */
export const ISOLATED_TRACKS = new Set(['kart-demo', 'holyland-racing', 'go-karting']);

export const TRACK_IDS = {
  'kart-demo': '1',
  'holyland-racing': '2',
  'go-karting': '3',
  default: '1',
};

export function usesIsolatedWorkspace(trackSlug) {
  return ISOLATED_TRACKS.has(trackSlug);
}

export function isDemoTrack(trackSlug) {
  return trackSlug === DEMO_TRACK;
}

export function resolveTrackId(trackSlug) {
  if (!trackSlug || trackSlug === 'default') return TRACK_IDS.default;
  return TRACK_IDS[trackSlug] || TRACK_IDS.default;
}

function storageKey(trackSlug) {
  return `${WORKSPACE_PREFIX}${trackSlug}`;
}

export function getWorkspaceId(trackSlug) {
  if (!trackSlug) return null;
  try {
    const installId = localStorage.getItem('hf_install_workspace');
    if (installId) return installId;
  } catch {
    /* ignore */
  }
  try {
    let id = localStorage.getItem(storageKey(trackSlug));
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(storageKey(trackSlug), id);
    }
    return id;
  } catch {
    return `local-${trackSlug}-${Date.now()}`;
  }
}

export function setInstallWorkspaceId(id) {
  try {
    if (id) localStorage.setItem('hf_install_workspace', id);
  } catch {
    /* ignore */
  }
}

export function resetWorkspaceId(trackSlug) {
  try {
    const id = crypto.randomUUID();
    localStorage.setItem(storageKey(trackSlug), id);
    return id;
  } catch {
    return `local-${trackSlug}-${Date.now()}`;
  }
}

export function getWorkspaceLabel(trackSlug) {
  const id = getWorkspaceId(trackSlug);
  return id ? id.slice(0, 8).toUpperCase() : '--------';
}
