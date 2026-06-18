const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const fs = require('fs');
const session = require('express-session');
const path = require('path');
const nodemailer = require('nodemailer');
const demoStore = require('./demoStore');
const trackProfile = require('./trackProfile');
const installConfig = require('./installConfig');
const fileExport = require('./fileExport');
const rentixWebhook = require('./rentixWebhook');
const { createLiveBroadcast } = require('./liveBroadcast');
const { createAmbTranx160Decoder } = require('./ambTranx160');

installConfig.ensureDataDirs();

const HF_CONTACT_EMAIL = process.env.HF_CONTACT_EMAIL || 'support.hakafast@gmail.com';
const contactRateLimit = new Map();

function createMailTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
    });
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
}

function contactRateOk(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = 8;
  const entry = contactRateLimit.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  contactRateLimit.set(ip, entry);
  return entry.count <= max;
}

function extractReplyEmail(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function sendViaWeb3Forms(payload) {
  const accessKey = process.env.WEB3FORMS_ACCESS_KEY;
  if (!accessKey) return { ok: false, error: 'not_configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: accessKey,
        subject: `HAKAFAST — ${payload.trackName}`,
        from_name: payload.contactName,
        email: payload.email,
        track: payload.trackName,
        phone: payload.phone || '',
        message: payload.message,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    return { ok: res.ok && data.success, error: data.message };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: err.message };
  }
}

async function sendViaFormSubmit(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(HF_CONTACT_EMAIL)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: `HAKAFAST — ${payload.trackName}`,
        _template: 'table',
        _captcha: 'false',
        _replyto: payload.email,
        track: payload.trackName,
        name: payload.contactName,
        email: payload.email,
        phone: payload.phone || '—',
        message: payload.message,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    return { ok: res.ok && Boolean(data.success), error: data.message };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: err.message };
  }
}

const app = express();
const port = process.env.PORT || 5000;
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');
const hasBuild = fs.existsSync(indexPath);

function validateDistAssets() {
  if (!hasBuild) return;
  const html = fs.readFileSync(indexPath, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const missing = refs.filter((ref) => {
    const filePath = path.join(distPath, ref.replace(/^\//, '').split('/').join(path.sep));
    return !fs.existsSync(filePath);
  });
  if (missing.length) {
    console.error('ERROR: Frontend build is incomplete. Missing files:');
    missing.forEach((ref) => console.error(`  - ${ref}`));
    console.error('Run npm run build locally, or ensure Render buildCommand succeeds.');
  }
}

validateDistAssets();

if (!hasBuild) {
  console.warn('WARNING: dist/index.html not found. Run "npm run build" before starting.');
}

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'hakafast_secret_key_2026',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 },
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// CSP — system fonts only (no external font CDNs)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data: blob:",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      "connect-src 'self' ws: wss:",
    ].join('; '),
  );
  next();
});

if (hasBuild) {
  app.use(express.static(distPath, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
}

app.use('/public', express.static(path.join(__dirname, 'public')));

async function migrateDB() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set — skipping migrations.');
    return;
  }
  try {
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email VARCHAR(100);`);
    await pool.query(`ALTER TABLE current_heat ADD COLUMN IF NOT EXISTS lap_count INT DEFAULT 0;`);
    await pool.query(`CREATE TABLE IF NOT EXISTS heat_history (id SERIAL PRIMARY KEY, track_id INT, heat_type VARCHAR(50), results JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS track_profiles (track_slug VARCHAR(64) PRIMARY KEY, profile JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    console.log('Migrations successful.');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}
migrateDB();

async function loadTrackProfileFromDb(trackSlug) {
  if (!process.env.DATABASE_URL || !trackSlug) return null;
  try {
    const result = await pool.query('SELECT profile FROM track_profiles WHERE track_slug = $1', [trackSlug]);
    if (!result.rows.length) return null;
    return trackProfile.normalizeTrackProfile(result.rows[0].profile, trackSlug);
  } catch {
    return null;
  }
}

async function saveTrackProfileToDb(trackSlug, profile) {
  if (!process.env.DATABASE_URL || !trackSlug) return;
  try {
    await pool.query(
      `INSERT INTO track_profiles (track_slug, profile, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (track_slug) DO UPDATE SET profile = EXCLUDED.profile, updated_at = CURRENT_TIMESTAMP`,
      [trackSlug, profile],
    );
  } catch (err) {
    console.error('track_profiles save error:', err.message);
  }
}

let pitLines = [{ id: 1, name: 'טור ימין', active: true, karts: [] }, { id: 2, name: 'טור שמאל', active: true, karts: [] }];
let heatSettings = {
  type: 'time',
  duration: 10,
  targetLaps: 0,
  timingColumns: { laps: true, second_best: false, avg_lap: false, level: false, gap: false },
};
let levelSettings = {
  editPassword: '',
  masterLapThreshold: '45.500',
  proLapThreshold: '42.000',
  pitExitPosition: 'bottom',
};
const trackSetups = {};
const driverQueues = {};

// ── Global championships store (shared across all tracks) ────────────────────
const CHAMPIONSHIPS_FILE = path.join(installConfig.getDataDir(), 'championships.json');

function loadGlobalChampionships() {
  try {
    if (fs.existsSync(CHAMPIONSHIPS_FILE)) {
      return JSON.parse(fs.readFileSync(CHAMPIONSHIPS_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return [];
}

function saveGlobalChampionships(list) {
  try {
    const tmp = `${CHAMPIONSHIPS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 0), 'utf8');
    fs.renameSync(tmp, CHAMPIONSHIPS_FILE);
  } catch { /* ignore */ }
}

let globalChampionships = loadGlobalChampionships();

// ── License validation ───────────────────────────────────────────────────────
const VALID_LICENSE_KEYS = new Set(
  (process.env.HF_LICENSE_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean)
);

function isValidLicenseKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (VALID_LICENSE_KEYS.size > 0) return VALID_LICENSE_KEYS.has(key.trim());
  // Dev fallback: any key starting with HF- and 12+ chars is valid
  return /^HF-[A-Z0-9]{8,}$/i.test(key.trim());
}

let liveBroadcast = null;
let ambDecoder = null;

function resolveBroadcastTarget(req) {
  const install = installConfig.loadInstallConfig();
  if (installConfig.isLocalInstall() && install?.workspaceId) {
    return {
      track: req?.headers?.['x-hf-track'] || install.trackSlug || process.env.HF_TRACK_SLUG || 'kart-demo',
      workspaceId: install.workspaceId,
    };
  }
  return {
    track: req?.headers?.['x-hf-track'],
    workspaceId: req?.headers?.['x-hf-workspace'],
  };
}

function notifyWorkspace(req) {
  if (!liveBroadcast) return;
  const { track, workspaceId } = resolveBroadcastTarget(req);
  if (track && workspaceId) liveBroadcast.broadcastWorkspace(track, workspaceId);
  const demo = demoStore.resolveWorkspace(req);
  if (demo) demoStore.persistStore(demo);
}

function requestTrackSlug(req) {
  return req.headers['x-hf-track'] || req.params?.trackSlug || null;
}

/** Isolated demo tracks must never fall back to shared in-memory / DB state. */
function missingIsolatedWorkspace(req) {
  const track = requestTrackSlug(req);
  if (!track || !demoStore.isIsolatedTrack(track)) return false;
  const install = installConfig.loadInstallConfig();
  if (installConfig.isLocalInstall() && install?.workspaceId) return false;
  return !req.headers['x-hf-workspace'];
}

function isStrongPassword(password) {
  if (!password || password.length < 12) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

function lapToSeconds(lap) {
  if (!lap || typeof lap !== 'string') return Infinity;
  const trimmed = lap.trim();
  if (trimmed.includes(':')) {
    const [mins, secs] = trimmed.split(':');
    return (parseInt(mins, 10) || 0) * 60 + (parseFloat(secs) || 0);
  }
  const value = parseFloat(trimmed);
  return Number.isNaN(value) ? Infinity : value;
}

async function applyAutoLevelUpgrades(trackId = 1) {
  if (!process.env.DATABASE_URL) return;
  const proSec = lapToSeconds(levelSettings.proLapThreshold);
  const masterSec = lapToSeconds(levelSettings.masterLapThreshold);
  const heat = await pool.query('SELECT * FROM current_heat WHERE track_id = $1', [trackId]);
  for (const row of heat.rows) {
    const bestSec = lapToSeconds(row.best_lap_time);
    if (bestSec === Infinity) continue;
    let newLevel = null;
    if (bestSec <= proSec) newLevel = 'Pro';
    else if (bestSec <= masterSec) newLevel = 'Master';
    if (!newLevel) continue;
    await pool.query(
      'UPDATE drivers SET driver_level = $1 WHERE full_name = $2 AND (driver_level IS NULL OR driver_level != $1)',
      [newLevel, row.driver_name],
    );
  }
}

function adminLoginRequired(trackName) {
  if (demoStore.isIsolatedTrack(trackName)) return false;
  return Boolean(levelSettings.editPassword || trackCredentials[trackName]);
}

const trackCredentials = {
  'holyland-racing': 'fast123',
  'go-karting': 'track2026',
};

function sendSpaIndex(res) {
  if (!hasBuild) {
    return res.status(503).send(`<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>HAKAFAST</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center;max-width:520px;margin:2rem auto">
<h1>HAKAFAST</h1>
<p>ה-build של הממשק לא הושלם. בדוק ב-Render את לוג ה-<strong>Build</strong> ואת ה-<strong>Start</strong>.</p>
<p style="font-size:.9rem;color:#444">Build Command: <code>npm install && npm run build</code><br>
Start Command: <code>npm start</code></p>
</body></html>`);
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.sendFile(indexPath);
}

function isStaticAssetRequest(reqPath) {
  if (reqPath.startsWith('/assets/') || reqPath.startsWith('/src/')) return true;
  return /\.(js|mjs|css|map|png|jpe?g|gif|svg|ico|woff2?|ttf|webp|json)$/i.test(reqPath);
}

// API routes
const translationsPath = path.join(__dirname, 'src', 'i18n', 'translations.json');
app.get('/api/translations', (req, res) => res.json(JSON.parse(fs.readFileSync(translationsPath, 'utf8'))));

app.post('/api/contact', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!contactRateOk(ip)) {
    return res.status(429).json({ success: false, error: 'rate_limited' });
  }

  const trackName = String(req.body?.trackName || '').trim().slice(0, 200);
  const contactName = String(req.body?.contactName || req.body?.contactDetails || '').trim().slice(0, 120);
  const email = String(req.body?.email || '').trim().slice(0, 120);
  const phone = String(req.body?.phone || '').trim().slice(0, 40);
  const message = String(req.body?.message || '').trim().slice(0, 4000);

  if (!trackName || !contactName || !email || !message) {
    return res.status(400).json({ success: false, error: 'missing_fields' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'invalid_email' });
  }

  const payload = { trackName, contactName, email, phone, message };

  const transporter = createMailTransporter();
  if (transporter) {
    const mailText = [
      `Track / Company: ${trackName}`,
      `Name: ${contactName}`,
      `Email: ${email}`,
      `Phone: ${phone || '—'}`,
      '',
      'Message:',
      message,
      '',
      `— Sent via HAKAFAST contact form (${new Date().toISOString()})`,
    ].join('\n');
    try {
      const sendPromise = transporter.sendMail({
        from: `"HAKAFAST" <${process.env.SMTP_USER}>`,
        to: HF_CONTACT_EMAIL,
        replyTo: email,
        subject: `HAKAFAST — ${trackName}`,
        text: mailText,
      });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('send_timeout')), 12000);
      });
      await Promise.race([sendPromise, timeoutPromise]);
      return res.json({ success: true, channel: 'smtp' });
    } catch (err) {
      console.error('Contact SMTP failed:', err.message);
    }
  }

  const web3 = await sendViaWeb3Forms(payload);
  if (web3.ok) return res.json({ success: true, channel: 'web3forms' });

  const formSubmit = await sendViaFormSubmit(payload);
  if (formSubmit.ok) return res.json({ success: true, channel: 'formsubmit' });

  console.error('Contact relay failed:', web3.error, formSubmit.error);
  return res.status(500).json({ success: false, error: 'send_failed' });
});
app.get('/api/admin/pits', (req, res) => {
  if (missingIsolatedWorkspace(req)) return res.json({ success: false, error: 'no_workspace' });
  const demo = demoStore.resolveWorkspace(req);
  if (demo) return res.json(demo.pitLines);
  return res.json(pitLines);
});

app.post('/api/admin/update-pits', (req, res) => {
  if (missingIsolatedWorkspace(req)) return res.json({ success: false, error: 'no_workspace' });
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demo.pitLines = demoStore.sanitizePitLines(req.body.newLines);
    return res.json({ success: true });
  }
  pitLines = req.body.newLines;
  return res.json({ success: true });
});

app.get('/api/heat-settings', (req, res) => {
  if (missingIsolatedWorkspace(req)) return res.json({ success: false, error: 'no_workspace' });
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    return res.json({
      ...demo.heatSettings,
      heatRuntime: demo.heatRuntime,
      heatClock: demoStore.getHeatClock(demo),
      onTrack: demo.onTrack,
    });
  }
  return res.json(heatSettings);
});

app.get('/api/admin/session-state', (req, res) => {
  if (missingIsolatedWorkspace(req)) return res.json({ success: false, error: 'no_workspace' });
  const demo = demoStore.resolveWorkspace(req);
  if (demo) return res.json(demoStore.getSessionState(demo));
  return res.json({
    heatSettings,
    heatRuntime: { startedAt: null, avgLapSec: 45 },
    heatClock: demoStore.getHeatClock({ heatSettings, heatRuntime: { startedAt: null } }),
    onTrack: [],
    pitLines,
  });
});

app.post('/api/admin/kart-launch', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { kart_number: kartNumber, laneId } = req.body;
  const result = demoStore.launchKart(demo, kartNumber, laneId);
  if (result.success) notifyWorkspace(req);
  return res.json({
    ...result,
    pitLines: demo.pitLines,
    onTrack: demo.onTrack,
  });
});

app.post('/api/admin/kart-grid-deploy', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { kart_number: kartNumber, all: deployAll } = req.body || {};
  const result = deployAll
    ? demoStore.deployAllGridKarts(demo)
    : demoStore.deployGridKart(demo, kartNumber);
  if (result.success) notifyWorkspace(req);
  return res.json({
    ...result,
    pitLines: demo.pitLines,
    onTrack: demo.onTrack,
    heatClock: demoStore.getHeatClock(demo),
  });
});

app.post('/api/transponder/pit-exit', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { transponder_id: transponderId } = req.body;
  if (!transponderId) return res.json({ success: false, error: 'missing_transponder' });
  const result = demoStore.processTransponderPitExit(demo, transponderId);
  if (result.success) notifyWorkspace(req);
  return res.json({
    ...result,
    pitLines: demo.pitLines,
    onTrack: demo.onTrack,
    heatClock: demoStore.getHeatClock(demo),
  });
});

app.post('/api/transponder/pit-entry', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { transponder_id: transponderId } = req.body;
  if (!transponderId) return res.json({ success: false, error: 'missing_transponder' });
  const result = demoStore.processTransponderPitEntry(demo, transponderId);
  if (result.success) notifyWorkspace(req);
  return res.json({
    ...result,
    pitLines: demo.pitLines,
    onTrack: demo.onTrack,
    heatClock: demoStore.getHeatClock(demo),
    nextHeatReadiness: demo.nextHeat.length ? demoStore.getNextHeatReadiness(demo) : null,
  });
});

app.post('/api/transponder/lap', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { transponder_id: transponderId, lap_time_sec: lapTimeSec } = req.body;
  if (!transponderId) return res.json({ success: false, error: 'missing_transponder' });
  const result = demoStore.processTransponderLap(demo, transponderId, lapTimeSec);
  if (result.success) notifyWorkspace(req);
  return res.json(result);
});

app.post('/api/decoder/passing', (req, res) => {
  if (!ambDecoder) return res.status(503).json({ success: false, error: 'decoder_not_ready' });
  const trackSlug = req.headers['x-hf-track'] || req.body?.trackSlug || process.env.AMB_TRACK_SLUG || 'kart-demo';
  const workspaceId = req.headers['x-hf-workspace'] || req.body?.workspaceId || process.env.AMB_WORKSPACE_ID;
  const result = ambDecoder.ingestJsonPassing(req.body, { trackSlug, workspaceId });
  return res.json(result);
});

app.get('/api/decoder/status', (req, res) => {
  if (!ambDecoder) return res.json({ enabled: false });
  return res.json({ enabled: true, ...ambDecoder.getStatus() });
});

app.post('/api/decoder/transponder-map', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const map = req.body?.map;
  if (!map || typeof map !== 'object') {
    return res.status(400).json({ success: false, error: 'invalid_map' });
  }
  const normalized = {};
  Object.entries(map).forEach(([tid, kart]) => {
    normalized[String(tid)] = Number(kart);
  });
  const teamMode = Boolean(req.body?.teamMode);
  if (teamMode) {
    demo.teamTransponderMap = { ...(demo.teamTransponderMap || {}), ...normalized };
  } else {
    demo.transponderMap = { ...(demo.transponderMap || {}), ...normalized };
    if (ambDecoder) ambDecoder.setTransponderMap(demo, normalized);
  }
  return res.json({
    success: true,
    transponderMap: demo.transponderMap,
    teamTransponderMap: demo.teamTransponderMap,
  });
});

app.get('/api/stats/top-laps', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  return res.json({
    success: true,
    period,
    laps: demoStore.getTopLaps(demo, period, limit),
    heatNumber: demoStore.getCurrentHeatNumber(demo),
  });
});

app.post('/api/admin/endurance/penalty', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { kart_number: kartNumber, seconds, reason } = req.body;
  const result = demoStore.addPenalty(demo, kartNumber, { seconds, reason });
  if (result.success) notifyWorkspace(req);
  return res.json(result);
});

app.post('/api/admin/endurance/driver-change', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { kart_number: kartNumber, driver_name: driverName } = req.body;
  const result = demoStore.setActiveDriver(demo, kartNumber, driverName);
  if (result.success) notifyWorkspace(req);
  return res.json(result);
});

app.post('/api/admin/endurance/team-transponder', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { transponder_id: transponderId, kart_number: kartNumber } = req.body;
  const result = demoStore.registerTeamTransponder(demo, transponderId, kartNumber);
  return res.json(result);
});

app.get('/api/kiosk/health', (req, res) => {
  const install = installConfig.loadInstallConfig();
  res.json({
    ok: true,
    service: 'hakafast',
    version: '1.0.0',
    mode: installConfig.isLocalInstall() ? 'local' : (process.env.HF_KIOSK_MODE === '1' ? 'kiosk' : 'server'),
    setupComplete: installConfig.isSetupComplete(),
    localInstall: installConfig.isLocalInstall(),
    dataDir: installConfig.isLocalInstall() ? installConfig.getDataDir() : undefined,
    exportsDir: installConfig.isLocalInstall() ? installConfig.getExportsDir() : undefined,
    trackSlug: install?.trackSlug || null,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/install/config', (req, res) => {
  const cfg = installConfig.loadInstallConfig();
  const port = Number(process.env.PORT) || 5000;
  const trackSlug = cfg?.trackSlug || process.env.HF_TRACK_SLUG || 'kart-demo';
  res.json({
    localInstall: installConfig.isLocalInstall(),
    setupComplete: installConfig.isSetupComplete(),
    config: cfg,
    dataDir: installConfig.getDataDir(),
    exportsDir: installConfig.getExportsDir(),
    networkUrls: installConfig.getLocalNetworkUrls(port),
    adminUrl: `http://127.0.0.1:${port}/admin/${trackSlug}`,
    liveTimingUrl: `http://127.0.0.1:${port}/live-timing/${trackSlug}`,
    receptionUrl: `http://127.0.0.1:${port}/reception/${trackSlug}`,
    port,
  });
});

app.post('/api/install/setup', (req, res) => {
  const { trackSlug, trackName, kartNumbers, adminPassword } = req.body || {};
  if (!trackSlug) {
    return res.json({ success: false, error: 'missing_fields' });
  }
  if (!demoStore.validateTrackSlug(trackSlug)) {
    return res.json({ success: false, error: 'invalid_track' });
  }
  if (adminPassword && !isStrongPassword(adminPassword)) {
    return res.json({ success: false, error: 'weak_password' });
  }
  const workspaceId = installConfig.createWorkspaceId();
  const config = installConfig.saveInstallConfig({
    localInstall: true,
    setupComplete: true,
    trackSlug,
    trackName: trackName || trackSlug,
    workspaceId,
    installedAt: new Date().toISOString(),
  });
  const store = demoStore.resolveFromParts(trackSlug, workspaceId);
  if (store) {
    store.trackSetup = { onboarded: true, kartNumbers: String(kartNumbers || '').trim() };
    store.trackProfile = trackProfile.normalizeTrackProfile({
      trackDisplayName: trackName || trackSlug,
    }, trackSlug);
    if (adminPassword) store.levelSettings.editPassword = adminPassword;
    demoStore.persistStore(store);
    if (!demoStore.isIsolatedTrack(trackSlug)) {
      saveTrackProfileToDb(trackSlug, store.trackProfile);
    }
  }
  const port = Number(process.env.PORT) || 5000;
  return res.json({
    success: true,
    config,
    networkUrls: installConfig.getLocalNetworkUrls(port),
    adminUrl: `http://127.0.0.1:${port}/admin/${trackSlug}`,
    liveTimingUrl: `http://127.0.0.1:${port}/live-timing/${trackSlug}`,
  });
});

app.get('/api/reception/state', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  return res.json({ success: true, ...demoStore.getReceptionState(demo) });
});

app.post('/api/reception/drivers', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const result = demoStore.addReceptionDriver(demo, req.body || {});
  if (result.success) notifyWorkspace(req);
  return res.json(result);
});

app.delete('/api/reception/drivers/:index', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const result = demoStore.removeReceptionDriver(demo, req.params.index);
  if (result.success) notifyWorkspace(req);
  return res.json(result);
});

app.get('/api/results/list', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  return res.json({ success: true, heats: demoStore.listHeatResults(demo, limit) });
});

app.get('/api/results/:heatNumber', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const heat = demoStore.getResultsForHeatNumber(demo, req.params.heatNumber);
  if (!heat) return res.status(404).json({ success: false, error: 'not_found' });
  return res.json({ success: true, heat });
});

// ── Championships ────────────────────────────────────────────────────────────

// ── Championship API (global store) ─────────────────────────────────────────

// GET all championships — strips passwords, returns public view
// Query: ?trackSlug=xxx  → also returns today's rounds for that track
app.get('/api/championships', (req, res) => {
  const trackSlug = req.query.trackSlug || null;
  const today = new Date().toISOString().slice(0, 10);
  const sanitized = globalChampionships.map((c) => {
    const { adminPassword: _pw, ...pub } = c;
    return {
      ...pub,
      rounds: (pub.rounds || []).map(({ eventPlan: _ep, ...r }) => r),
      hasPassword: Boolean(_pw),
    };
  });
  const todayRounds = trackSlug
    ? globalChampionships.flatMap((c) =>
        (c.rounds || [])
          .filter((r) => r.trackSlug === trackSlug && r.date === today)
          .map((r) => ({ championshipId: c.id, championshipName: c.name, round: { ...r, eventPlan: undefined } }))
      )
    : [];
  return res.json({ success: true, championships: sanitized, todayRounds });
});

// POST upsert a single championship OR bulk-replace all (legacy modal format)
app.post('/api/championships', (req, res) => {
  const body = req.body || {};

  // Bulk replace (legacy ChampionshipModal format: { championships: [...] })
  if (Array.isArray(body.championships)) {
    globalChampionships = body.championships.map((c) => ({
      ...c,
      updatedAt: Date.now(),
      createdAt: c.createdAt || Date.now(),
    }));
    saveGlobalChampionships(globalChampionships);
    return res.json({ success: true });
  }

  // Single upsert (ChampionshipPage format: { championship, password })
  const { championship } = body;
  if (!championship || !championship.name) {
    return res.status(400).json({ success: false, error: 'invalid_body' });
  }
  const existing = globalChampionships.find((c) => c.id === championship.id);
  if (existing) {
    if (existing.adminPassword && body.password !== existing.adminPassword) {
      return res.json({ success: false, error: 'bad_password' });
    }
    const updated = { ...existing, ...championship, id: existing.id, updatedAt: Date.now() };
    globalChampionships = globalChampionships.map((c) => c.id === existing.id ? updated : c);
  } else {
    globalChampionships = [...globalChampionships, { ...championship, createdAt: Date.now(), updatedAt: Date.now() }];
  }
  saveGlobalChampionships(globalChampionships);
  return res.json({ success: true });
});

// DELETE a championship
app.delete('/api/championships/:id', (req, res) => {
  const id = req.params.id;
  const existing = globalChampionships.find((c) => c.id === id);
  if (!existing) return res.json({ success: false, error: 'not_found' });
  if (existing.adminPassword && req.body?.password !== existing.adminPassword) {
    return res.json({ success: false, error: 'bad_password' });
  }
  globalChampionships = globalChampionships.filter((c) => c.id !== id);
  saveGlobalChampionships(globalChampionships);
  return res.json({ success: true });
});

// Verify championship admin password
app.post('/api/championships/:id/verify-password', (req, res) => {
  const id = req.params.id;
  const existing = globalChampionships.find((c) => c.id === id);
  if (!existing) return res.json({ success: false, error: 'not_found' });
  if (!existing.adminPassword) return res.json({ success: true });
  return res.json({ success: req.body?.password === existing.adminPassword });
});

// GET upcoming championship rounds for a track (calendar view for track admins)
// Query: ?days=N (default 90) — how many days ahead to look
app.get('/api/track-calendar/:trackSlug', (req, res) => {
  const { trackSlug } = req.params;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 1), 365);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + days);
  const todayStr = today.toISOString().slice(0, 10);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // A round is "in range" if its start date is within the window OR it's multi-day and ends within the window
  function roundInRange(r) {
    if (!r.date) return false;
    const effective = r.endDate && r.endDate > r.date ? r.endDate : r.date;
    return r.date <= cutoffStr && effective >= todayStr;
  }

  const entries = [];
  for (const c of globalChampionships) {
    // Top-level rounds (may have divisionId if organizer assigned them to a league)
    for (const r of c.rounds || []) {
      if (r.trackSlug === trackSlug && roundInRange(r)) {
        const assignedDiv = r.divisionId ? (c.divisions || []).find((d) => d.id === r.divisionId) : null;
        entries.push({
          championshipId: c.id,
          championshipName: c.name,
          championshipScope: c.scope || 'singular',
          divisionId: assignedDiv?.id || null,
          divisionName: assignedDiv?.name || null,
          round: { id: r.id, label: r.label, date: r.date, endDate: r.endDate || null, time: r.time || null, raceType: r.raceType || 'sprint', isOfficial: r.isOfficial || false },
        });
      }
    }
    // Division rounds
    for (const div of c.divisions || []) {
      for (const r of div.rounds || []) {
        if (r.trackSlug === trackSlug && roundInRange(r)) {
          entries.push({
            championshipId: c.id,
            championshipName: c.name,
            championshipScope: c.scope || 'singular',
            divisionId: div.id,
            divisionName: div.name,
            round: { id: r.id, label: r.label, date: r.date, endDate: r.endDate || null, time: r.time || null, raceType: r.raceType || 'sprint', isOfficial: r.isOfficial || false },
          });
        }
      }
    }
  }

  entries.sort((a, b) => {
    const da = a.round.date + (a.round.time || '00:00');
    const db = b.round.date + (b.round.time || '00:00');
    return da < db ? -1 : da > db ? 1 : 0;
  });

  return res.json({ success: true, trackSlug, entries });
});

// ── License verification ─────────────────────────────────────────────────────

app.post('/api/admin/verify-license', (req, res) => {
  const key = req.body?.licenseKey;
  if (!isValidLicenseKey(key)) return res.json({ success: false, error: 'invalid_key' });

  // Save key to the track's levelSettings
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demo.levelSettings.licenseKey = key.trim();
    demoStore.persistStore(demo);
  } else {
    levelSettings.licenseKey = key.trim();
  }
  return res.json({ success: true, features: ['pro_events', 'official_rounds'] });
});

app.get('/api/admin/license-status', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  const settings = demo ? demo.levelSettings : levelSettings;
  const licensed = isValidLicenseKey(settings.licenseKey);
  return res.json({ licensed, features: licensed ? ['pro_events', 'official_rounds'] : [] });
});

app.get('/api/webhooks/rentix/status', (req, res) => {
  const settings = rentixWebhook.getRentixSettings();
  return res.json({
    ok: true,
    configured: Boolean(settings.publicKey && settings.secretKey),
    webhookSecretSet: Boolean(settings.webhookSecret),
    resultsWebhookSet: Boolean(settings.resultsWebhookUrl),
    inbound: 'POST /api/webhooks/rentix',
    sync: 'POST /api/webhooks/rentix/sync',
  });
});

app.post('/api/webhooks/rentix', (req, res) => {
  if (!rentixWebhook.verifyWebhook(req)) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const drivers = rentixWebhook.parseDriverPayload(req.body);
  if (!drivers.length) return res.json({ success: false, error: 'no_drivers' });
  const result = rentixWebhook.ingestDriversToStore(demo, demoStore, drivers);
  notifyWorkspace(req);
  return res.json({ success: true, ...result });
});

app.post('/api/webhooks/rentix/sync', async (req, res) => {
  if (!rentixWebhook.verifyWebhook(req)) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const fetched = await rentixWebhook.fetchRentixOrders(req.body || {});
  if (!fetched.success) return res.json(fetched);
  const result = rentixWebhook.ingestDriversToStore(demo, demoStore, fetched.drivers);
  notifyWorkspace(req);
  return res.json({ success: true, orders: fetched.orders, ...result });
});

app.post('/api/install/rentix', (req, res) => {
  const {
    webhookSecret, publicKey, secretKey, resultsWebhookUrl, rentId, apiUrl,
  } = req.body || {};
  const config = rentixWebhook.saveRentixConfig({
    ...(webhookSecret !== undefined && { webhookSecret }),
    ...(publicKey !== undefined && { publicKey }),
    ...(secretKey !== undefined && { secretKey }),
    ...(resultsWebhookUrl !== undefined && { resultsWebhookUrl }),
    ...(rentId !== undefined && { rentId }),
    ...(apiUrl !== undefined && { apiUrl }),
  });
  return res.json({ success: true, rentix: config.rentix || {} });
});

app.get('/api/kiosk/capabilities', (req, res) => {
  res.json({
    transponder: {
      pit_exit: 'POST /api/transponder/pit-exit',
      pit_entry: 'POST /api/transponder/pit-entry',
      lap: 'POST /api/transponder/lap',
      amb_passing: 'POST /api/decoder/passing',
      amb_status: 'GET /api/decoder/status',
      amb_map: 'POST /api/decoder/transponder-map',
      protocol: 'MYLAPS P3 (TranX 160 / TranX3)',
      headers: ['x-hf-track', 'x-hf-workspace'],
    },
    admin: {
      session_state: 'GET /api/admin/session-state',
      heat_settings: 'GET /api/heat-settings',
      track_config: 'GET /api/kiosk/track-config',
      track_profile: 'GET /api/admin/track-profile',
      live_timing_ws: 'WebSocket /ws/live-timing',
    },
    deployment: {
      on_premise: true,
      embedded_browser: 'MSI / Electron / WebView2',
      env: [
        'PORT', 'HF_KIOSK_MODE', 'HF_TRACK_SLUG', 'HF_WORKSPACE_ID',
        'AMB_DECODER_HOST', 'AMB_DECODER_PORT', 'AMB_DECODER_SERIAL',
        'AMB_TRACK_SLUG', 'AMB_WORKSPACE_ID', 'AMB_TRANSPONDER_MAP',
      ],
    },
  });
});

app.post('/api/admin/kart-return', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { kart_number: kartNumber, laneId } = req.body;
  const result = demoStore.returnKart(demo, kartNumber, laneId);
  if (result.success) notifyWorkspace(req);
  return res.json({
    ...result,
    pitLines: demo.pitLines,
    onTrack: demo.onTrack,
    heatClock: demoStore.getHeatClock(demo),
  });
});

app.post('/api/admin/heat-settings', (req, res) => {
  if (missingIsolatedWorkspace(req)) return res.json({ success: false, error: 'no_workspace' });
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demo.heatSettings = { ...demo.heatSettings, ...req.body };
    demoStore.schedulePersist(demo);
    notifyWorkspace(req);
    return res.json({ success: true });
  }
  heatSettings = { ...heatSettings, ...req.body };
  return res.json({ success: true });
});

app.get('/api/admin/level-settings', (req, res) => {
  if (missingIsolatedWorkspace(req)) return res.json({ success: false, error: 'no_workspace' });
  const demo = demoStore.resolveWorkspace(req);
  const settings = demo ? demo.levelSettings : levelSettings;
  return res.json({
    masterLapThreshold: settings.masterLapThreshold,
    proLapThreshold: settings.proLapThreshold,
    pitExitPosition: settings.pitExitPosition || 'bottom',
    hasPassword: Boolean(settings.editPassword),
    licensed: isValidLicenseKey(settings.licenseKey),
  });
});

app.get('/api/kiosk/track-config', async (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  return res.json({ success: true, ...demoStore.getKioskTrackConfig(demo) });
});

app.get('/api/admin/track-profile', async (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    const profile = demoStore.getTrackProfile(demo);
    return res.json({
      success: true,
      profile,
      dayPlan: trackProfile.calculateDayPlan(profile),
    });
  }
  return res.json({ success: false, error: 'no_workspace' });
});

app.post('/api/admin/track-profile', async (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const result = demoStore.updateTrackProfile(demo, req.body || {});
  notifyWorkspace(req);
  return res.json({
    ...result,
    dayPlan: trackProfile.calculateDayPlan(demo.trackProfile),
  });
});

app.get('/api/admin/track-setup/:trackSlug', (req, res) => {
  if (missingIsolatedWorkspace(req)) {
    return res.json({ onboarded: false, kartNumbers: '' });
  }
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    return res.json({
      onboarded: Boolean(demo.trackSetup?.onboarded),
      kartNumbers: demo.trackSetup?.kartNumbers || '',
      trackProfile: demoStore.getTrackProfile(demo),
    });
  }
  const setup = trackSetups[req.params.trackSlug];
  return res.json({
    onboarded: Boolean(setup?.onboarded),
    kartNumbers: setup?.kartNumbers || '',
  });
});

app.post('/api/admin/track-setup', (req, res) => {
  const { trackSlug, kartNumbers, editPassword, multipleKartTypes, kartTypes } = req.body;
  if (!trackSlug) {
    return res.json({ success: false, error: 'missing_fields' });
  }
  if (editPassword && !isStrongPassword(editPassword)) {
    return res.json({ success: false, error: 'weak_password' });
  }
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demo.trackSetup = { onboarded: true, kartNumbers: String(kartNumbers || '').trim() };
    const profilePatch = {};
    if (typeof multipleKartTypes === 'boolean') profilePatch.multipleKartTypes = multipleKartTypes;
    if (Array.isArray(kartTypes)) profilePatch.kartTypes = kartTypes;
    demoStore.updateTrackProfile(demo, profilePatch);
    if (editPassword) demo.levelSettings.editPassword = editPassword;
    demoStore.persistStore(demo);
    return res.json({
      success: true,
      kartNumbers: demo.trackSetup.kartNumbers,
      profile: demoStore.getTrackProfile(demo),
    });
  }
  if (demoStore.isIsolatedTrack(trackSlug)) {
    return res.json({ success: false, error: 'no_workspace' });
  }
  trackSetups[trackSlug] = { onboarded: true, kartNumbers: String(kartNumbers || '').trim() };
  if (editPassword) levelSettings.editPassword = editPassword;
  return res.json({ success: true, kartNumbers });
});

app.post('/api/admin/verify-settings-password', (req, res) => {
  if (missingIsolatedWorkspace(req)) return res.json({ success: false, error: 'no_workspace' });
  const demo = demoStore.resolveWorkspace(req);
  const settings = demo ? demo.levelSettings : levelSettings;
  if (!settings.editPassword) return res.json({ success: true });
  return res.json({ success: req.body.password === settings.editPassword });
});

app.post('/api/admin/sync-queue/:trackSlug', (req, res) => {
  if (missingIsolatedWorkspace(req)) return res.json({ success: false, error: 'no_workspace' });
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demo.driverQueue = req.body.queue || [];
    notifyWorkspace(req);
    return res.json({ success: true });
  }
  driverQueues[req.params.trackSlug] = req.body.queue || [];
  return res.json({ success: true });
});

app.get('/api/workspace/backup', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  return res.json({ success: true, snapshot: demoStore.exportSnapshot(demo) });
});

app.post('/api/workspace/backup', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  if (req.body.snapshot) demoStore.applySnapshot(demo, req.body.snapshot);
  if (req.body.clientSnapshot) demo.clientSnapshot = req.body.clientSnapshot;
  notifyWorkspace(req);
  return res.json({ success: true });
});

app.post('/api/workspace/reset', (req, res) => {
  const track = req.headers['x-hf-track'];
  const workspaceId = req.headers['x-hf-workspace'];
  if (!track || !workspaceId || !demoStore.validateTrackSlug(track) || !demoStore.validateWorkspaceId(workspaceId)) {
    return res.json({ success: false, error: 'invalid_workspace' });
  }
  demoStore.resetStore(track, workspaceId);
  notifyWorkspace(req);
  return res.json({ success: true });
});

app.post('/api/admin/level-settings', (req, res) => {
  if (missingIsolatedWorkspace(req)) return res.json({ success: false, error: 'no_workspace' });
  const { masterLapThreshold, proLapThreshold, editPassword, pitExitPosition } = req.body;
  const demo = demoStore.resolveWorkspace(req);
  const settings = demo ? demo.levelSettings : levelSettings;
  if (masterLapThreshold) settings.masterLapThreshold = masterLapThreshold;
  if (proLapThreshold) settings.proLapThreshold = proLapThreshold;
  if (pitExitPosition === 'top' || pitExitPosition === 'bottom') {
    settings.pitExitPosition = pitExitPosition;
  }
  if (editPassword) {
    if (!isStrongPassword(editPassword)) {
      return res.json({ success: false, error: 'weak_password' });
    }
    settings.editPassword = editPassword;
  }
  return res.json({ success: true });
});

app.get('/api/admin/login-required/:trackName', (req, res) => {
  const { trackName } = req.params;
  return res.json({ required: adminLoginRequired(trackName) });
});

app.post('/api/admin/login/:trackName', (req, res) => {
  const { trackName } = req.params;
  const { password } = req.body;
  if (!adminLoginRequired(trackName)) {
    req.session.authenticatedTrack = trackName;
    return res.json({ success: true });
  }
  const expected = levelSettings.editPassword || trackCredentials[trackName];
  if (expected && expected === password) {
    req.session.authenticatedTrack = trackName;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: 'Password incorrect' });
});

app.post('/api/admin/finish-heat', async (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demoStore.finishHeat(demo, { keepOnTrack: demo.onTrack.length > 0 });
    notifyWorkspace(req);
    return res.json({
      success: true,
      draining: demo.heatFrozen,
      pitLines: demo.pitLines,
      onTrack: demo.onTrack,
    });
  }
  try {
    await applyAutoLevelUpgrades(1);
    const data = await pool.query('SELECT * FROM current_heat WHERE track_id = 1');
    if (data.rows.length > 0) {
      await pool.query('INSERT INTO heat_history (track_id, heat_type, results) VALUES ($1, $2, $3)', [1, heatSettings.type, JSON.stringify(data.rows)]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/auto-export-ack', async (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    let fileExportResult = null;
    let rentixPush = null;
    if (installConfig.isLocalInstall() && demo.autoFinishHeatNumber) {
      const heat = demoStore.getResultsForHeatNumber(demo, demo.autoFinishHeatNumber);
      if (heat?.results?.length) {
        const hs = demo.heatSettings || {};
        fileExportResult = fileExport.exportHeatResultsToFolder(demo, {
          heatNumber: demo.autoFinishHeatNumber,
          results: heat.results,
          heatType: heat.heat_type,
          exportCsv: hs.exportCsv !== false,
          exportPdf: Boolean(hs.exportPdf),
        });
        rentixPush = await rentixWebhook.pushHeatResults(
          rentixWebhook.buildHeatResultsPayload(
            demo,
            demoStore,
            demo.autoFinishHeatNumber,
            heat.results,
            heat.heat_type,
          ),
        );
      }
    }
    const ack = demoStore.acknowledgeAutoExport(demo);
    notifyWorkspace(req);
    return res.json({
      success: true,
      fileExport: fileExportResult,
      rentix: rentixPush,
      pitLines: ack.pitLines,
      onTrack: ack.onTrack,
    });
  }
  res.json({ success: true });
});

app.get('/api/admin/export-data', async (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (demo) return res.json(demoStore.exportData(demo));
  try {
    const result = await pool.query('SELECT * FROM current_heat WHERE track_id = 1 ORDER BY best_lap_time ASC NULLS LAST');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.get('/api/admin/export-csv', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM current_heat WHERE track_id = 1 ORDER BY best_lap_time ASC');
    let csv = '\uFEFFPos,Kart,Driver,Level,Last,Best,Laps\n';
    result.rows.forEach((r, i) => { csv += `${i + 1},${r.kart_number},"${r.driver_name}",${r.driver_level || ''},${r.last_lap_time || ''},${r.best_lap_time || ''},${r.lap_count}\n`; });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('Results.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/assign-driver', async (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demoStore.assignDriver(demo, req.body);
    notifyWorkspace(req);
    return res.status(201).json({ success: true });
  }
  const { track_id, kart_number, driver_name, driver_level, phone, email } = req.body;
  try {
    await pool.query(`INSERT INTO current_heat (track_id, kart_number, driver_name, driver_level) VALUES ($1, $2, $3, $4)`,
      [track_id, kart_number, driver_name, driver_level || null]);
    if (phone || email) {
      await pool.query(`INSERT INTO drivers (track_id, full_name, phone, email, driver_level) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [track_id, driver_name, phone || null, email || null, driver_level || 'Amateur']);
    }
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/update-driver-level', async (req, res) => {
  const { lookup, level, password } = req.body;
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    return res.json(demoStore.updateDriverLevel(demo, lookup, level, password));
  }
  if (levelSettings.editPassword && password !== levelSettings.editPassword) {
    return res.json({ success: false, error: 'bad_password' });
  }
  try {
    const result = await pool.query(`UPDATE drivers SET driver_level = $1 WHERE phone = $2 OR email = $2 RETURNING *`, [level, lookup]);
    if (result.rowCount > 0) res.json({ success: true });
    else res.json({ success: false, error: 'Driver not found' });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get('/live-timing-data/:track_id', async (req, res) => {
  const mode = req.query.mode || 'timing';
  const trackId = req.params.track_id;
  const trackSlug = req.headers['x-hf-track'] || (trackId === '1' ? 'kart-demo' : String(trackId));
  const demo = demoStore.resolveWorkspace(req);

  if (demo) {
    const payload = demoStore.getLivePayload(demo, mode);
    return res.json(payload.rows);
  }

  if (demoStore.isIsolatedTrack(trackSlug)) {
    return res.json([]);
  }

  if (mode === 'assignments') {
    try {
      const order = heatSettings.type === 'sprint' || heatSettings.type === 'endurance'
        ? (heatSettings.type === 'sprint' ? 'lap_count DESC, best_lap_time ASC' : 'best_lap_time ASC NULLS LAST')
        : 'id ASC';
      const result = await pool.query(
        `SELECT kart_number, driver_name, driver_level FROM current_heat WHERE track_id = $1 ORDER BY ${order}`,
        [trackId],
      );
      if (result.rows.length > 0) {
        return res.json(result.rows.map((r, i) => ({
          position: i + 1,
          kart_number: r.kart_number,
          driver_name: r.driver_name,
          driver_level: r.driver_level,
          status: 'assigned',
        })));
      }
    } catch {
      /* fall through to queue */
    }
    const queue = driverQueues[trackSlug] || [];
    return res.json(queue.map((d, i) => ({
      position: i + 1,
      driver_name: d.name,
      kart_number: null,
      status: 'queued',
    })));
  }

  try {
    const order = heatSettings.type === 'sprint' ? 'lap_count DESC, best_lap_time ASC' : 'best_lap_time ASC NULLS LAST';
    const result = await pool.query(`SELECT * FROM current_heat WHERE track_id = $1 ORDER BY ${order} LIMIT 30`, [trackId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.post('/api/admin/assign-heat', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { assignments, heatSettings, pitLines } = req.body;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.json({ success: false, error: 'no_assignments' });
  }
  if (pitLines) demoStore.mergeClientPitLines(demo, pitLines);
  const result = demoStore.assignHeatBatch(demo, assignments, heatSettings);
  if (result.success) {
    demo.driverQueue = [];
    notifyWorkspace(req);
  }
  return res.json(result);
});

app.post('/api/admin/clear-heat', async (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demoStore.clearHeat(demo);
    notifyWorkspace(req);
    return res.json({ success: true });
  }
  try {
    await pool.query('DELETE FROM current_heat WHERE track_id = 1');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get('/admin/:trackName', (req, res) => {
  const { trackName } = req.params;
  if (!adminLoginRequired(trackName)) {
    req.session.authenticatedTrack = trackName;
    return sendSpaIndex(res);
  }
  if (req.session.authenticatedTrack !== trackName) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>HAKAFAST | Login</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #f4f7f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #000080; }
          .login-box { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-top: 5px solid #000080; text-align: center; width: 320px; }
          input { width: 100%; padding: 10px; margin: 15px 0; border: 1px solid #cbd5e0; border-radius: 6px; box-sizing: border-box; }
          button { background: #000080; color: white; border: none; padding: 11px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; }
          button:hover { background: #40E0D0; color: #000080; }
        </style>
      </head>
      <body>
        <div class="login-box">
          <h2>HAKAFAST LOGIN</h2>
          <p>ניהול מסלול: <b>${trackName}</b></p>
          <input type="password" id="pass" placeholder="הזן סיסמת מנהל">
          <button onclick="login()">התחבר למערכת</button>
        </div>
        <script>
          async function login() {
            const password = document.getElementById('pass').value;
            const res = await fetch('/api/admin/login/${trackName}', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (data.success) window.location.reload();
            else alert('סיסמה שגויה!');
          }
        </script>
      </body>
      </html>
    `);
  }
  return sendSpaIndex(res);
});

app.get('/', (req, res) => sendSpaIndex(res));

// SPA fallback for client-side routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/live-timing-data/') || req.path === '/assign-driver') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (isStaticAssetRequest(req.path)) {
    return res.status(404).type('text/plain').send(
      'Asset not found. Run npm run build, then restart the server (npm start).',
    );
  }
  return sendSpaIndex(res);
});

const httpServer = http.createServer(app);
liveBroadcast = createLiveBroadcast(httpServer, {
  demoStore,
  pool,
  getGlobalHeatSettings: () => heatSettings,
  driverQueues,
});

ambDecoder = createAmbTranx160Decoder({
  demoStore,
  notifyWorkspace,
  getDefaultTrack: () => process.env.HF_TRACK_SLUG || 'kart-demo',
  getDefaultWorkspace: () => process.env.HF_WORKSPACE_ID || process.env.AMB_WORKSPACE_ID || null,
});
ambDecoder.start().catch((err) => console.error('[AMB TranX160] start failed:', err.message));

httpServer.listen(port, () => {
  console.log(`HAKAFAST active on port ${port}${hasBuild ? '' : ' (no frontend build — run npm run build)'}`);
});
