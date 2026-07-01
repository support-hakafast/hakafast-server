const crypto = require('crypto');
const installConfig = require('./installConfig');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const HASH_PREFIX = 'scrypt$';

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashPassword(plain) {
  if (!plain) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plain), salt, 64, SCRYPT_PARAMS).toString('hex');
  return `${HASH_PREFIX}${salt}$${derived}`;
}

function verifyPassword(plain, stored) {
  if (!stored) return !plain;
  if (!plain) return false;
  if (stored.startsWith(HASH_PREFIX)) {
    const [, salt, expected] = stored.split('$');
    if (!salt || !expected) return false;
    const derived = crypto.scryptSync(String(plain), salt, 64, SCRYPT_PARAMS).toString('hex');
    return timingSafeEqualStr(derived, expected);
  }
  return timingSafeEqualStr(String(plain), String(stored));
}

function normalizeStoredPassword(plain) {
  if (!plain) return '';
  return hashPassword(plain);
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const cfg = installConfig.loadInstallConfig();
  if (cfg?.sessionSecret) return cfg.sessionSecret;
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    installConfig.saveInstallConfig({ sessionSecret: secret });
  } catch {
    /* first boot before data dir */
  }
  return secret;
}

function createRateLimiter({ windowMs = 60_000, max = 20 } = {}) {
  const buckets = new Map();
  return function rateLimit(key) {
    const now = Date.now();
    const entry = buckets.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }
    entry.count += 1;
    buckets.set(key, entry);
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (now > v.reset) buckets.delete(k);
      }
    }
    return entry.count <= max;
  };
}

function isLocalRequest(req) {
  const raw = req.socket?.remoteAddress || '';
  const ip = String(raw).replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '';
}

module.exports = {
  hashPassword,
  verifyPassword,
  normalizeStoredPassword,
  getSessionSecret,
  createRateLimiter,
  isLocalRequest,
  timingSafeEqualStr,
};
