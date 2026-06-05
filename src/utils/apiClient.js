import { getWorkspaceId, usesIsolatedWorkspace } from './workspace.js';

export function apiFetch(input, init = {}, trackSlug = null) {
  const opts = { credentials: 'same-origin', ...init };
  const headers = new Headers(opts.headers || {});
  if (trackSlug && usesIsolatedWorkspace(trackSlug)) {
    headers.set('X-HF-Workspace', getWorkspaceId(trackSlug));
    headers.set('X-HF-Track', trackSlug);
  }
  opts.headers = headers;
  return fetch(input, opts);
}
