const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function getDataDir() {
  if (process.env.HF_DATA_DIR) return process.env.HF_DATA_DIR;
  const base = process.env.ProgramData
    || (process.platform === 'win32'
      ? path.join(process.env.SystemDrive || 'C:', 'ProgramData')
      : path.join(os.homedir(), '.hakafast'));
  return path.join(base, 'HAKAFAST');
}

function getExportsDir() {
  return process.env.HF_EXPORT_DIR || path.join(getDataDir(), 'exports');
}

function getWorkspacesDir() {
  return path.join(getDataDir(), 'workspaces');
}

function getInstallConfigPath() {
  return path.join(getDataDir(), 'install.json');
}

function ensureDataDirs() {
  const dirs = [getDataDir(), getWorkspacesDir(), getExportsDir()];
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function loadInstallConfig() {
  try {
    const raw = fs.readFileSync(getInstallConfigPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveInstallConfig(config) {
  ensureDataDirs();
  const next = {
    ...loadInstallConfig(),
    ...config,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(getInstallConfigPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function isLocalInstall() {
  return process.env.HF_KIOSK_MODE === '1'
    || process.env.HF_LOCAL_INSTALL === '1'
    || Boolean(loadInstallConfig()?.localInstall);
}

function isSetupComplete() {
  const cfg = loadInstallConfig();
  return Boolean(cfg?.setupComplete && cfg?.workspaceId && cfg?.trackSlug);
}

function createWorkspaceId() {
  return crypto.randomUUID();
}

function getLocalNetworkUrls(port = Number(process.env.PORT) || 5000) {
  const nets = os.networkInterfaces();
  const urls = [];
  Object.values(nets).forEach((ifaces) => {
    (ifaces || []).forEach((iface) => {
      if (iface.family !== 'IPv4' || iface.internal) return;
      urls.push(`http://${iface.address}:${port}`);
    });
  });
  return urls;
}

module.exports = {
  getDataDir,
  getExportsDir,
  getWorkspacesDir,
  getInstallConfigPath,
  ensureDataDirs,
  loadInstallConfig,
  saveInstallConfig,
  isLocalInstall,
  isSetupComplete,
  createWorkspaceId,
  getLocalNetworkUrls,
};
