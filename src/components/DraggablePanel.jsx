import React, { useRef, useState } from 'react';

function loadPosition(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch {
    /* ignore */
  }
  return fallback;
}

export default function DraggablePanel({
  panelId,
  title,
  children,
  defaultPosition,
  width = 360,
  className = '',
}) {
  const storageKey = `hf_panel_${panelId}`;
  const [pos, setPos] = useState(() => loadPosition(storageKey, defaultPosition));
  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0, left: 0, top: 0 });

  const savePosition = (next) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const onPointerDown = (e) => {
    if (!e.target.closest('[data-drag-handle]')) return;
    dragging.current = true;
    start.current = { x: e.clientX, y: e.clientY, left: pos.x, top: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const next = {
      x: Math.max(0, start.current.left + e.clientX - start.current.x),
      y: Math.max(80, start.current.top + e.clientY - start.current.y),
    };
    setPos(next);
  };

  const onPointerUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    const next = {
      x: Math.max(0, start.current.left + e.clientX - start.current.x),
      y: Math.max(80, start.current.top + e.clientY - start.current.y),
    };
    setPos(next);
    savePosition(next);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={`draggable-panel panel ${className}`.trim()}
      style={{ left: pos.x, top: pos.y, width }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="draggable-panel-handle" data-drag-handle title={title}>
        <span className="draggable-grip" aria-hidden>⠿</span>
        {title && <span className="draggable-title">{title}</span>}
      </div>
      <div className="draggable-panel-body">{children}</div>
    </div>
  );
}
