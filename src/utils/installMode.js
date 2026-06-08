let cached = null;
let fetchPromise = null;

export async function fetchInstallConfig(force = false) {
  if (cached && !force) return cached;
  if (fetchPromise && !force) return fetchPromise;
  fetchPromise = fetch('/api/install/config', { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      cached = data;
      fetchPromise = null;
      return cached;
    })
    .catch(() => {
      fetchPromise = null;
      return null;
    });
  return fetchPromise;
}

export function getCachedInstallConfig() {
  return cached;
}

export function isLocalInstallReady() {
  return Boolean(cached?.localInstall && cached?.setupComplete && cached?.config?.workspaceId);
}

export function getInstallTrackSlug(fallback = 'kart-demo') {
  return cached?.config?.trackSlug || fallback;
}

export function getInstallWorkspaceId() {
  return cached?.config?.workspaceId || null;
}
