#!/usr/bin/env node
/**
 * Print the current 6-digit HQ login code.
 * Usage:  node scripts/hq-code.js
 * Requires HQ_SECRET to be set in environment or passed as first arg.
 */
const crypto = require('crypto');

const secret = process.argv[2] || process.env.HQ_SECRET || '';
if (!secret) {
  console.error('Usage: node scripts/hq-code.js <HQ_SECRET>  or set HQ_SECRET env var');
  process.exit(1);
}

function totpCode(secret, windowOffset = 0) {
  const window = Math.floor(Date.now() / 1000 / 30) + windowOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(window));
  const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'utf8'));
  hmac.update(buf);
  const digest = hmac.digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

const code = totpCode(secret);
const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`\nHQ Code: ${code}  (valid for ${secondsLeft}s)\n`);
