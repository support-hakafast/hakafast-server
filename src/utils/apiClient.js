import { getCachedInstallConfig } from './installMode.js';
import { getWorkspaceId, usesIsolatedWorkspace } from './workspace.js';

export function apiFetch(input, init = {}, trackSlug = null) {
  const opts = { credentials: 'same-origin', ...init };
  const headers = new Headers(opts.headers || {});
  const install = getCachedInstallConfig();

  if (install?.localInstall && install?.config?.workspaceId) {
    headers.set('X-HF-Workspace', install.config.workspaceId);
    headers.set('X-HF-Track', trackSlug || install.config.trackSlug || 'kart-demo');
  } else if (trackSlug && usesIsolatedWorkspace(trackSlug)) {
    headers.set('X-HF-Workspace', getWorkspaceId(trackSlug));
    headers.set('X-HF-Track', trackSlug);
  }

  opts.headers = headers;
  return fetch(input, opts);
}
