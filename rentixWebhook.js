const crypto = require('crypto');
const installConfig = require('./installConfig');

const LEVEL_MAP = {
  amateur: 'Amateur',
  beginner: 'Amateur',
  chobby: 'Amateur',
  master: 'Master',
  pro: 'Pro',
  professional: 'Pro',
};

function getRentixSettings() {
  const cfg = installConfig.loadInstallConfig();
  const rentix = cfg?.rentix || {};
  return {
    webhookSecret: process.env.HF_RENTIX_WEBHOOK_SECRET || rentix.webhookSecret || '',
    apiUrl: (process.env.HF_RENTIX_API_URL || rentix.apiUrl || 'https://cms.rentix.biz/api').replace(/\/$/, ''),
    publicKey: process.env.HF_RENTIX_PUBLIC_KEY || rentix.publicKey || '',
    secretKey: process.env.HF_RENTIX_SECRET_KEY || rentix.secretKey || '',
    resultsWebhookUrl: process.env.HF_RENTIX_RESULTS_URL || rentix.resultsWebhookUrl || '',
    rentId: rentix.rentId || process.env.HF_RENTIX_RENT_ID || null,
  };
}

function verifyWebhook(req) {
  const { webhookSecret } = getRentixSettings();
  if (!webhookSecret) return true;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const header = req.headers['x-hf-rentix-secret'] || req.headers['x-rentix-secret'] || bearer;
  if (header === webhookSecret) return true;
  const sig = req.headers['x-hf-signature'] || req.headers['x-rentix-signature'];
  if (sig && req.rawBody) {
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.rawBody)
      .digest('hex');
    return sig === expected || sig === `sha256=${expected}`;
  }
  return false;
}

function mapLevel(level) {
  if (!level) return 'Amateur';
  const key = String(level).trim().toLowerCase();
  return LEVEL_MAP[key] || (['Amateur', 'Master', 'Pro'].includes(level) ? level : 'Amateur');
}

function parseSingleDriver(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw.name || raw.fio || raw.driver_name || raw.full_name || raw.client_name;
  if (!name || !String(name).trim()) return null;
  return {
    name: String(name).trim(),
    phone: raw.phone || raw.mobile || raw.client_phone || null,
    team_name: raw.team_name || raw.team || null,
    driver_level: mapLevel(raw.driver_level || raw.level || raw.category || raw.skill),
    source: 'rentix',
    rentix_order_id: raw.order_id || raw.orderId || raw.id || null,
    added_at: new Date().toISOString(),
  };
}

function parseDriverPayload(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body.map(parseSingleDriver).filter(Boolean);
  if (Array.isArray(body.drivers)) return body.drivers.map(parseSingleDriver).filter(Boolean);
  if (Array.isArray(body.orders)) {
    return body.orders.map((order) => parseSingleDriver({
      ...order,
      name: order.fio || order.name,
      order_id: order.id || order.order_id,
    })).filter(Boolean);
  }
  if (body.event === 'driver.queue' && body.driver) {
    const d = parseSingleDriver(body.driver);
    return d ? [d] : [];
  }
  const single = parseSingleDriver(body.driver || body);
  return single ? [single] : [];
}

function ingestDriversToStore(store, demoStore, drivers) {
  let added = 0;
  const errors = [];
  drivers.forEach((driver) => {
    const result = demoStore.addReceptionDriver(store, driver);
    if (result.success) added += 1;
    else errors.push({ driver: driver.name, error: result.error });
  });
  return { added, errors, driverQueue: store.driverQueue };
}

async function fetchRentixOrders(options = {}) {
  const settings = getRentixSettings();
  if (!settings.publicKey || !settings.secretKey) {
    return { success: false, error: 'rentix_not_configured' };
  }
  const auth = Buffer.from(`${settings.publicKey}:${settings.secretKey}`).toString('base64');
  const params = new URLSearchParams();
  if (settings.rentId) params.set('rent', String(settings.rentId));
  params.set('limit', String(options.limit || 50));
  params.set('last_days', String(options.lastDays || 1));
  if (options.fullPaid !== false) params.set('full_paid', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${settings.apiUrl}/rent/orders?${params}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.message || `rentix_http_${res.status}` };
    }
    const orders = Array.isArray(data) ? data : (data.orders || data.data || []);
    const drivers = parseDriverPayload({ orders });
    return { success: true, orders: orders.length, drivers };
  } catch (err) {
    clearTimeout(timer);
    return { success: false, error: err.message };
  }
}

async function pushHeatResults(payload) {
  const settings = getRentixSettings();
  if (!settings.resultsWebhookUrl) return { skipped: true, reason: 'no_results_url' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (settings.webhookSecret) {
    headers['X-HF-Rentix-Secret'] = settings.webhookSecret;
    headers['X-HF-Signature'] = crypto
      .createHmac('sha256', settings.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  try {
    const res = await fetch(settings.resultsWebhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { success: res.ok, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    return { success: false, error: err.message };
  }
}

function buildHeatResultsPayload(store, demoStore, heatNumber, results, heatType) {
  return {
    event: 'heat.results',
    source: 'hakafast',
    exportedAt: new Date().toISOString(),
    trackSlug: store.trackSlug,
    heatNumber,
    heatType,
    results: (results || []).map((r, i) => ({
      position: i + 1,
      kart_number: r.kart_number,
      driver_name: r.driver_name,
      driver_level: r.driver_level,
      best_lap_time: r.best_lap_time,
      last_lap_time: r.last_lap_time,
      lap_count: r.lap_count || 0,
    })),
  };
}

function saveRentixConfig(partial) {
  const cfg = installConfig.loadInstallConfig() || {};
  return installConfig.saveInstallConfig({
    ...cfg,
    rentix: {
      ...(cfg.rentix || {}),
      ...partial,
    },
  });
}

module.exports = {
  getRentixSettings,
  verifyWebhook,
  parseDriverPayload,
  ingestDriversToStore,
  fetchRentixOrders,
  pushHeatResults,
  buildHeatResultsPayload,
  saveRentixConfig,
};
