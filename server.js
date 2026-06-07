const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const fs = require('fs');
const session = require('express-session');
const path = require('path');
const nodemailer = require('nodemailer');
const demoStore = require('./demoStore');
const { createLiveBroadcast } = require('./liveBroadcast');

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
  app.use(express.static(distPath, { index: false }));
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
    console.log('Migrations successful.');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}
migrateDB();

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

let liveBroadcast = null;

function notifyWorkspace(req) {
  if (!liveBroadcast) return;
  const track = req.headers['x-hf-track'];
  const workspaceId = req.headers['x-hf-workspace'];
  if (track && workspaceId) liveBroadcast.broadcastWorkspace(track, workspaceId);
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

const ISOLATED_TRACKS = new Set(['kart-demo', 'holyland-racing', 'go-karting']);

function adminLoginRequired(trackName) {
  if (ISOLATED_TRACKS.has(trackName)) return false;
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
<body style="font-family:system-ui,sans-serif;padding:2rem;text-align:center">
<h1>HAKAFAST</h1>
<p>האתר עדיין לא נבנה. הרץ <code>npm run build</code> ואז <code>npm start</code>.</p>
</body></html>`);
  }
  return res.sendFile(indexPath);
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
  const demo = demoStore.resolveWorkspace(req);
  if (demo) return res.json(demo.pitLines);
  return res.json(pitLines);
});

app.post('/api/admin/update-pits', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demo.pitLines = demoStore.sanitizePitLines(req.body.newLines);
    return res.json({ success: true });
  }
  pitLines = req.body.newLines;
  return res.json({ success: true });
});

app.get('/api/heat-settings', (req, res) => {
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

app.post('/api/transponder/lap', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (!demo) return res.json({ success: false, error: 'no_workspace' });
  const { transponder_id: transponderId, lap_time_sec: lapTimeSec } = req.body;
  if (!transponderId) return res.json({ success: false, error: 'missing_transponder' });
  const result = demoStore.processTransponderLap(demo, transponderId, lapTimeSec);
  if (result.success) notifyWorkspace(req);
  return res.json(result);
});

app.get('/api/kiosk/health', (req, res) => {
  res.json({
    ok: true,
    service: 'hakafast',
    version: '1.0.0',
    mode: process.env.HF_KIOSK_MODE === '1' ? 'kiosk' : 'server',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/kiosk/capabilities', (req, res) => {
  res.json({
    transponder: {
      pit_exit: 'POST /api/transponder/pit-exit',
      lap: 'POST /api/transponder/lap',
      headers: ['x-hf-track', 'x-hf-workspace'],
    },
    admin: {
      session_state: 'GET /api/admin/session-state',
      heat_settings: 'GET /api/heat-settings',
      live_timing_ws: 'WebSocket /ws/live-timing',
    },
    deployment: {
      on_premise: true,
      embedded_browser: 'MSI / Electron / WebView2',
      env: ['PORT', 'HF_KIOSK_MODE', 'HF_TRACK_SLUG', 'HF_WORKSPACE_ID'],
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
  });
});

app.post('/api/admin/heat-settings', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demo.heatSettings = req.body;
    notifyWorkspace(req);
    return res.json({ success: true });
  }
  heatSettings = req.body;
  return res.json({ success: true });
});

app.get('/api/admin/level-settings', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  const settings = demo ? demo.levelSettings : levelSettings;
  return res.json({
    masterLapThreshold: settings.masterLapThreshold,
    proLapThreshold: settings.proLapThreshold,
    pitExitPosition: settings.pitExitPosition || 'bottom',
    hasPassword: Boolean(settings.editPassword),
  });
});

app.get('/api/admin/track-setup/:trackSlug', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    return res.json({
      onboarded: Boolean(demo.trackSetup?.onboarded),
      kartNumbers: demo.trackSetup?.kartNumbers || '',
    });
  }
  const setup = trackSetups[req.params.trackSlug];
  return res.json({
    onboarded: Boolean(setup?.onboarded),
    kartNumbers: setup?.kartNumbers || '',
  });
});

app.post('/api/admin/track-setup', (req, res) => {
  const { trackSlug, kartNumbers, editPassword } = req.body;
  if (!trackSlug || !kartNumbers) {
    return res.json({ success: false, error: 'missing_fields' });
  }
  if (editPassword && !isStrongPassword(editPassword)) {
    return res.json({ success: false, error: 'weak_password' });
  }
  const demo = demoStore.resolveWorkspace(req);
  if (demo) {
    demo.trackSetup = { onboarded: true, kartNumbers };
    if (editPassword) demo.levelSettings.editPassword = editPassword;
    return res.json({ success: true, kartNumbers });
  }
  trackSetups[trackSlug] = { onboarded: true, kartNumbers };
  if (editPassword) levelSettings.editPassword = editPassword;
  return res.json({ success: true, kartNumbers });
});

app.post('/api/admin/verify-settings-password', (req, res) => {
  const demo = demoStore.resolveWorkspace(req);
  const settings = demo ? demo.levelSettings : levelSettings;
  if (!settings.editPassword) return res.json({ success: true });
  return res.json({ success: req.body.password === settings.editPassword });
});

app.post('/api/admin/sync-queue/:trackSlug', (req, res) => {
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
    demoStore.finishHeat(demo);
    notifyWorkspace(req);
    return res.json({ success: true });
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
  const trackSlug = trackId === '1' ? 'kart-demo' : String(trackId);
  const demo = demoStore.resolveWorkspace(req);

  if (demo) {
    const payload = demoStore.getLivePayload(demo, mode);
    return res.json(payload.rows);
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
  if (pitLines) demo.pitLines = demoStore.sanitizePitLines(pitLines);
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
  return sendSpaIndex(res);
});

const httpServer = http.createServer(app);
liveBroadcast = createLiveBroadcast(httpServer, {
  demoStore,
  pool,
  getGlobalHeatSettings: () => heatSettings,
  driverQueues,
});

httpServer.listen(port, () => {
  console.log(`HAKAFAST active on port ${port}${hasBuild ? '' : ' (no frontend build — run npm run build)'}`);
});
