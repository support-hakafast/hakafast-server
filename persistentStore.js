const fs = require('fs');
const path = require('path');
const { getWorkspacesDir, ensureDataDirs } = require('./installConfig');

function workspaceFilePath(trackSlug, workspaceId) {
  const safeTrack = String(trackSlug).replace(/[^a-z0-9-]/gi, '_');
  const safeWs = String(workspaceId).replace(/[^a-zA-Z0-9-]/g, '_');
  return path.join(getWorkspacesDir(), `${safeTrack}_${safeWs}.json`);
}

function loadWorkspaceSnapshot(trackSlug, workspaceId) {
  ensureDataDirs();
  const filePath = workspaceFilePath(trackSlug, workspaceId);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveWorkspaceSnapshot(trackSlug, workspaceId, snapshot) {
  ensureDataDirs();
  const filePath = workspaceFilePath(trackSlug, workspaceId);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 0), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function deleteWorkspaceSnapshot(trackSlug, workspaceId) {
  const filePath = workspaceFilePath(trackSlug, workspaceId);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

module.exports = {
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  deleteWorkspaceSnapshot,
};
