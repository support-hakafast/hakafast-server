import { useEffect, useRef, useState } from 'react';
import { getWorkspaceId, usesIsolatedWorkspace } from '../utils/workspace.js';

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/live-timing`;
}

export function useLiveTimingSocket({
  trackSlug,
  trackId,
  mode,
  enabled = true,
  fallbackPollMs = 2000,
  fetchFallback,
}) {
  const [rows, setRows] = useState([]);
  const [heatType, setHeatType] = useState('time');
  const [timingColumns, setTimingColumns] = useState(null);
  const [timingColumnOrder, setTimingColumnOrder] = useState(null);
  const [hasPreparedHeat, setHasPreparedHeat] = useState(false);
  const [heatNumber, setHeatNumber] = useState(null);
  const [topLaps, setTopLaps] = useState(null);
  const [heatClock, setHeatClock] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!enabled) return undefined;

    const workspaceId = trackSlug && usesIsolatedWorkspace(trackSlug)
      ? getWorkspaceId(trackSlug)
      : null;

    const subscribe = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'subscribe',
          trackSlug: trackSlug || 'kart-demo',
          workspaceId,
          trackId: String(trackId),
          mode: modeRef.current,
        }));
      }
    };

    const startPolling = () => {
      if (!fetchFallback || pollRef.current) return;
      const poll = async () => {
        try {
          const data = await fetchFallback();
          if (data) {
            setRows(data.rows || []);
            if (data.heatType) setHeatType(data.heatType);
            if (data.timingColumns) setTimingColumns(data.timingColumns);
            if (data.timingColumnOrder) setTimingColumnOrder(data.timingColumnOrder);
            setHasPreparedHeat(Boolean(data.hasPreparedHeat));
            if (data.heatNumber != null) setHeatNumber(data.heatNumber);
            if (data.topLaps) setTopLaps(data.topLaps);
            if (data.heatClock) setHeatClock(data.heatClock);
          }
        } catch {
          /* ignore */
        }
      };
      poll();
      pollRef.current = setInterval(poll, fallbackPollMs);
    };

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    let closed = false;

    try {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (closed) return;
        setConnected(true);
        stopPolling();
        subscribe();
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'update') {
            setRows(Array.isArray(msg.rows) ? msg.rows : []);
            if (msg.heatType) setHeatType(msg.heatType);
            if (msg.timingColumns) setTimingColumns(msg.timingColumns);
            if (msg.timingColumnOrder) setTimingColumnOrder(msg.timingColumnOrder);
            setHasPreparedHeat(Boolean(msg.hasPreparedHeat));
            if (msg.heatNumber != null) setHeatNumber(msg.heatNumber);
            if (msg.topLaps) setTopLaps(msg.topLaps);
            if (msg.heatClock) setHeatClock(msg.heatClock);
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closed) startPolling();
      };

      ws.onerror = () => {
        setConnected(false);
        ws.close();
      };
    } catch {
      startPolling();
    }

    return () => {
      closed = true;
      stopPolling();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, trackSlug, trackId, mode, fallbackPollMs, fetchFallback]);

  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const workspaceId = trackSlug && usesIsolatedWorkspace(trackSlug)
      ? getWorkspaceId(trackSlug)
      : null;
    wsRef.current.send(JSON.stringify({
      type: 'subscribe',
      trackSlug: trackSlug || 'kart-demo',
      workspaceId,
      trackId: String(trackId),
      mode,
    }));
  }, [mode, trackSlug, trackId]);

  return {
    rows, heatType, timingColumns, timingColumnOrder, connected, hasPreparedHeat, heatNumber, topLaps, heatClock,
  };
}
