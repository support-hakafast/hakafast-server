const { WebSocketServer } = require('ws');

function createLiveBroadcast(httpServer, deps) {
  const { demoStore, pool, getGlobalHeatSettings, driverQueues } = deps;
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/live-timing' });
  const clients = new Set();

  wss.on('connection', (ws) => {
    ws.subscription = {
      trackSlug: 'kart-demo',
      workspaceId: null,
      trackId: '1',
      mode: 'timing',
    };
    clients.add(ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'subscribe') {
          ws.subscription = {
            trackSlug: msg.trackSlug || 'kart-demo',
            workspaceId: msg.workspaceId || null,
            trackId: String(msg.trackId || '1'),
            mode: msg.mode === 'assignments' ? 'assignments' : 'timing',
          };
        }
      } catch {
        /* ignore malformed */
      }
    });

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  async function fetchDbTiming(trackId, mode, trackSlug) {
    if (mode === 'assignments') {
      try {
        const result = await pool.query(
          'SELECT kart_number, driver_name, driver_level FROM current_heat WHERE track_id = $1 ORDER BY kart_number ASC',
          [trackId],
        );
        if (result.rows.length > 0) {
          return {
            rows: result.rows.map((r, i) => ({
              position: i + 1,
              kart_number: r.kart_number,
              driver_name: r.driver_name,
              driver_level: r.driver_level,
              status: 'assigned',
            })),
            heatType: getGlobalHeatSettings().type,
          };
        }
      } catch {
        /* fall through */
      }
      const queue = driverQueues[trackSlug] || [];
      return {
        rows: queue.map((d, i) => ({
          position: i + 1,
          driver_name: d.name,
          kart_number: null,
          status: 'queued',
        })),
        heatType: getGlobalHeatSettings().type,
      };
    }

    try {
      const order = getGlobalHeatSettings().type === 'sprint'
        ? 'lap_count DESC, best_lap_time ASC'
        : 'best_lap_time ASC NULLS LAST';
      const result = await pool.query(`SELECT * FROM current_heat WHERE track_id = $1 ORDER BY ${order} LIMIT 30`, [trackId]);
      return { rows: result.rows, heatType: getGlobalHeatSettings().type };
    } catch {
      return { rows: [], heatType: getGlobalHeatSettings().type };
    }
  }

  async function fetchPayload(sub) {
    const { trackSlug, workspaceId, trackId, mode } = sub;
    if (workspaceId && demoStore.validateWorkspaceId(workspaceId)) {
      const store = demoStore.resolveFromParts(trackSlug, workspaceId);
      if (store) return demoStore.getLivePayload(store, mode);
    }
    if (process.env.DATABASE_URL) {
      return fetchDbTiming(trackId, mode, trackSlug);
    }
    return { rows: [], heatType: 'time' };
  }

  async function pushToClient(ws) {
    if (ws.readyState !== 1) return;
    const payload = await fetchPayload(ws.subscription);
    ws.send(JSON.stringify({
      type: 'update',
      mode: ws.subscription.mode,
      rows: payload.rows,
      heatType: payload.heatType,
      heatClock: payload.heatClock || null,
      timingColumns: payload.timingColumns || null,
      hasPreparedHeat: Boolean(payload.hasPreparedHeat),
      heatNumber: payload.heatNumber || null,
      topLaps: payload.topLaps || null,
      ts: Date.now(),
    }));
  }

  async function broadcastAll() {
    const tasks = [...clients].map((ws) => pushToClient(ws));
    await Promise.allSettled(tasks);
  }

  function broadcastWorkspace(trackSlug, workspaceId) {
    [...clients].forEach((ws) => {
      const sub = ws.subscription;
      if (sub.workspaceId === workspaceId && sub.trackSlug === trackSlug) {
        pushToClient(ws);
      }
    });
  }

  const interval = setInterval(broadcastAll, 500);

  return {
    broadcastAll,
    broadcastWorkspace,
    close: () => {
      clearInterval(interval);
      wss.close();
    },
  };
}

module.exports = { createLiveBroadcast };
