/**
 * AMB TranX 160 / MYLAPS P3 decoder integration.
 *
 * Connects as TCP client to decoder (default port 5403) or accepts JSON passings
 * from AMM Converter (ammconverter.eu) via POST /api/decoder/passing.
 *
 * Env:
 *   AMB_DECODER_HOST     — decoder IP (e.g. 192.168.1.50)
 *   AMB_DECODER_PORT     — default 5403
 *   AMB_DECODER_SERIAL   — optional COM port (requires `serialport` package)
 *   AMB_DECODER_BAUD     — default 9600
 *   AMB_TRACK_SLUG       — workspace track slug (default kart-demo)
 *   AMB_WORKSPACE_ID     — workspace id (8+ chars)
 *   AMB_PIT_LOOP_ID      — optional loop id for pit exit passings (launch)
 *   AMB_PIT_IN_LOOP_ID   — optional loop id for pit entry passings (return to queue)
 *   AMB_TRANSPONDER_MAP  — JSON map { "transponderId": kartNumber }
 */

const net = require('net');
const { AmbP3StreamParser } = require('./ambP3Parser');

const DEFAULT_PORT = 5403;
const DEFAULT_BAUD = 9600;
const RECONNECT_MS = 5000;

function parseTransponderMap(raw) {
  if (!raw) return {};
  try {
    const map = JSON.parse(raw);
    if (!map || typeof map !== 'object') return {};
    const out = {};
    Object.entries(map).forEach(([tid, kart]) => {
      out[String(tid)] = Number(kart);
    });
    return out;
  } catch {
    return {};
  }
}

function rtcToSeconds(rtcMicros) {
  if (!rtcMicros || Number.isNaN(Number(rtcMicros))) return null;
  return Number(rtcMicros) / 1e6;
}

function createAmbTranx160Decoder(deps) {
  const { demoStore, notifyWorkspace, getDefaultTrack = () => 'kart-demo', getDefaultWorkspace = () => null } = deps;

  const config = {
    host: process.env.AMB_DECODER_HOST || '',
    port: Number(process.env.AMB_DECODER_PORT) || DEFAULT_PORT,
    serial: process.env.AMB_DECODER_SERIAL || '',
    baud: Number(process.env.AMB_DECODER_BAUD) || DEFAULT_BAUD,
    trackSlug: process.env.AMB_TRACK_SLUG || getDefaultTrack(),
    workspaceId: process.env.AMB_WORKSPACE_ID || getDefaultWorkspace(),
    pitLoopId: process.env.AMB_PIT_LOOP_ID ? String(process.env.AMB_PIT_LOOP_ID) : null,
    pitInLoopId: process.env.AMB_PIT_IN_LOOP_ID ? String(process.env.AMB_PIT_IN_LOOP_ID) : null,
    globalTransponderMap: parseTransponderMap(process.env.AMB_TRANSPONDER_MAP),
  };

  const rtcState = new Map();
  const parser = new AmbP3StreamParser();
  let socket = null;
  let serialPort = null;
  let reconnectTimer = null;
  let started = false;
  const stats = {
    connected: false,
    mode: null,
    passings: 0,
    laps: 0,
    errors: 0,
    lastPassingAt: null,
    lastError: null,
  };

  function workspaceKey(trackSlug, workspaceId) {
    return `${trackSlug}:${workspaceId || 'default'}`;
  }

  function resolveStore(trackSlug, workspaceId) {
    if (workspaceId && demoStore.validateWorkspaceId(workspaceId)) {
      return demoStore.resolveFromParts(trackSlug, workspaceId);
    }
    return null;
  }

  function getTransponderMap(store) {
    return {
      ...config.globalTransponderMap,
      ...(store?.transponderMap || {}),
    };
  }

  function mapTransponder(store, transponderId) {
    const tid = String(transponderId);
    const map = getTransponderMap(store);
    if (map[tid]) return Number(map[tid]);
    const asNum = parseInt(tid, 10);
    if (!Number.isNaN(asNum) && asNum > 0) return asNum;
    return null;
  }

  function handlePassing(passing, meta = {}) {
    if (!passing || passing.typeName !== 'PASSING') return null;
    const transponderId = passing.TRANSPONDER;
    if (!transponderId) return null;

    stats.passings += 1;
    stats.lastPassingAt = new Date().toISOString();

    const trackSlug = meta.trackSlug || config.trackSlug;
    const workspaceId = meta.workspaceId || config.workspaceId;
    const store = resolveStore(trackSlug, workspaceId);
    if (!store) {
      stats.errors += 1;
      stats.lastError = 'no_workspace';
      return { success: false, error: 'no_workspace' };
    }

    const loopId = meta.loop_id != null ? String(meta.loop_id) : null;
    const kartNumber = mapTransponder(store, transponderId);
    if (!kartNumber) {
      stats.errors += 1;
      stats.lastError = `unknown_transponder:${transponderId}`;
      return { success: false, error: 'unknown_transponder', transponder: transponderId };
    }

    const wsKey = workspaceKey(trackSlug, workspaceId);
    if (!rtcState.has(wsKey)) rtcState.set(wsKey, new Map());
    const lastRtcMap = rtcState.get(wsKey);

    let lapTimeSec = null;
    const rtcSec = rtcToSeconds(passing.RTC_TIME);
    if (rtcSec != null && lastRtcMap.has(transponderId)) {
      const delta = rtcSec - lastRtcMap.get(transponderId);
      if (delta > 0.5 && delta < 600) lapTimeSec = delta;
    }
    if (rtcSec != null) lastRtcMap.set(transponderId, rtcSec);

    let result;
    const isPitInLoop = config.pitInLoopId && loopId === config.pitInLoopId;
    const isPitOutLoop = config.pitLoopId && loopId === config.pitLoopId;
    if (isPitInLoop) {
      result = demoStore.processTransponderPitEntry(store, String(transponderId));
    } else if (isPitOutLoop) {
      result = demoStore.processTransponderPitExit(store, String(transponderId));
    } else if (lapTimeSec != null) {
      result = demoStore.processTransponderLap(store, String(transponderId), lapTimeSec);
      if (result.success) stats.laps += 1;
    } else {
      result = { success: true, skipped: 'first_passing_or_no_rtc_delta', transponder: transponderId };
    }

    if (result.success && notifyWorkspace) {
      notifyWorkspace({ headers: { 'x-hf-track': trackSlug, 'x-hf-workspace': workspaceId } });
    }

    return {
      success: result.success,
      transponder: transponderId,
      kart: kartNumber,
      lap_time_sec: lapTimeSec,
      ...result,
    };
  }

  function onBinaryChunk(chunk) {
    const records = parser.push(chunk);
    records.forEach((record) => {
      if (record.error) {
        stats.errors += 1;
        stats.lastError = record.error;
        return;
      }
      if (record.typeName === 'PASSING') handlePassing(record);
    });
  }

  function connectTcp() {
    if (!config.host || socket) return;
    stats.mode = 'tcp';
    socket = net.createConnection({ host: config.host, port: config.port }, () => {
      stats.connected = true;
      stats.lastError = null;
      console.log(`[AMB TranX160] Connected to ${config.host}:${config.port} (P3)`);
    });

    socket.on('data', onBinaryChunk);
    socket.on('error', (err) => {
      stats.connected = false;
      stats.lastError = err.message;
      console.error('[AMB TranX160] Socket error:', err.message);
    });
    socket.on('close', () => {
      stats.connected = false;
      socket = null;
      parser.reset();
      if (started) scheduleReconnect();
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectTcp();
    }, RECONNECT_MS);
  }

  async function connectSerial() {
    if (!config.serial) return false;
    let SerialPort;
    try {
      ({ SerialPort } = require('serialport'));
    } catch {
      console.warn('[AMB TranX160] serialport package not installed — use TCP or npm install serialport');
      return false;
    }

    stats.mode = 'serial';
    serialPort = new SerialPort({ path: config.serial, baudRate: config.baud });
    serialPort.on('data', onBinaryChunk);
    serialPort.on('open', () => {
      stats.connected = true;
      console.log(`[AMB TranX160] Serial open ${config.serial} @ ${config.baud} (P3)`);
    });
    serialPort.on('error', (err) => {
      stats.connected = false;
      stats.lastError = err.message;
      console.error('[AMB TranX160] Serial error:', err.message);
    });
    serialPort.on('close', () => {
      stats.connected = false;
      serialPort = null;
      parser.reset();
      if (started) scheduleReconnect();
    });
    return true;
  }

  function ingestJsonPassing(body, meta = {}) {
    if (!body || body.msg !== 'PASSING') {
      return { success: false, error: 'not_a_passing' };
    }
    const passing = {
      typeName: 'PASSING',
      TRANSPONDER: body.transponder || parseInt(String(body.tran_code || '').replace(/\D/g, ''), 10) || null,
      RTC_TIME: body.rtc_time ? parseRtcString(body.rtc_time) : body.RTC_TIME,
      PASSING_NUMBER: body.passing_number,
      STRENGTH: body.strength,
      HITS: body.hits,
    };
    return handlePassing(passing, { ...meta, loop_id: body.loop_id });
  }

  function parseRtcString(rtc) {
    if (typeof rtc === 'number') return rtc;
    const str = String(rtc);
    const match = str.match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
    if (!match) return null;
    const ms = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${(match[5] || '0').slice(0, 3)}Z`);
    return Number.isNaN(ms) ? null : ms * 1000;
  }

  function setTransponderMap(store, map) {
    if (!store) return;
    store.transponderMap = { ...(store.transponderMap || {}), ...map };
  }

  async function start() {
    if (started) return;
    started = true;
    if (config.serial) {
      const ok = await connectSerial();
      if (ok) return;
    }
    if (config.host) connectTcp();
    else if (!config.serial) {
      console.log('[AMB TranX160] Decoder idle — set AMB_DECODER_HOST or POST /api/decoder/passing');
    }
  }

  function stop() {
    started = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (socket) socket.destroy();
    socket = null;
    if (serialPort) serialPort.close();
    serialPort = null;
    parser.reset();
    stats.connected = false;
  }

  function getStatus() {
    return {
      ...stats,
      config: {
        host: config.host || null,
        port: config.port,
        serial: config.serial || null,
        trackSlug: config.trackSlug,
        workspaceId: config.workspaceId,
        pitLoopId: config.pitLoopId,
        pitInLoopId: config.pitInLoopId,
        mapSize: Object.keys(config.globalTransponderMap).length,
      },
    };
  }

  function reconfigure(newConfig = {}) {
    const hostChanged = newConfig.host !== undefined && newConfig.host !== config.host;
    const portChanged = newConfig.port !== undefined && Number(newConfig.port) !== config.port;
    if (newConfig.host !== undefined) config.host = newConfig.host;
    if (newConfig.port !== undefined) config.port = Number(newConfig.port) || DEFAULT_PORT;
    if (newConfig.transponderMap !== undefined) config.globalTransponderMap = newConfig.transponderMap;
    if (hostChanged || portChanged) {
      stop();
      started = true;
      if (config.host) connectTcp();
    }
  }

  return {
    start,
    stop,
    reconfigure,
    getStatus,
    ingestJsonPassing,
    handlePassing,
    setTransponderMap,
    config,
  };
}

module.exports = { createAmbTranx160Decoder };
