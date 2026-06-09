/**
 * Ensure dist/index.html exists before starting the server.
 * Render (and local `npm start`) self-heals when build phase was skipped or failed.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'dist', 'index.html');

function distLooksComplete() {
  if (!fs.existsSync(indexPath)) return false;
  const html = fs.readFileSync(indexPath, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  if (!refs.length) return false;
  return refs.every((ref) => {
    const filePath = path.join(root, 'dist', ref.replace(/^\//, '').split('/').join(path.sep));
    return fs.existsSync(filePath);
  });
}

if (!distLooksComplete()) {
  console.log('[HAKAFAST] dist/ missing or incomplete — running npm run build...');
  execSync('npm run build', {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  if (!distLooksComplete()) {
    console.error('[HAKAFAST] Build finished but dist/ is still incomplete.');
    process.exit(1);
  }
  console.log('[HAKAFAST] Frontend build OK.');
}
