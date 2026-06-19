/**
 * Fail the build if dist/index.html references missing hashed assets.
 * Run automatically via npm postbuild.
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('verify-build: dist/index.html not found — run vite build');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
let ok = true;

refs.forEach((ref) => {
  const filePath = path.join(distDir, ref.replace(/^\//, '').split('/').join(path.sep));
  if (!fs.existsSync(filePath)) {
    console.error(`verify-build: missing ${ref}`);
    ok = false;
  }
});

if (!ok) {
  process.exit(1);
}

console.log(`verify-build: OK (${refs.length} assets)`);
