import React, { useRef } from 'react';
import { PANEL_SIZES } from '../utils/panelLayout.js';

export default function DraggablePanel({
  panelId,
  title,
  children,
  position,
  width,
  className = '',
  onPositionChange,
  zIndex = 100,
  onFocus,
}) {
  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const panelWidth = width || PANEL_SIZES[panelId]?.width || 360;

  const onPointerDown = (e) => {
    if (!e.target.closest('[data-drag-handle]')) return;
    onFocus?.(panelId);
    dragging.current = true;
    start.current = { x: e.clientX, y: e.clientY, left: position.x, top: position.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    onPositionChange(panelId, {
      x: Math.max(0, start.current.left + e.clientX - start.current.x),
      y: Math.max(80, start.current.top + e.clientY - start.current.y),
    }, false);
  };

  const onPointerUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    onPositionChange(panelId, {
      x: Math.max(0, start.current.left + e.clientX - start.current.x),
      y: Math.max(80, start.current.top + e.clientY - start.current.y),
    }, true);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={`draggable-panel panel ${className}`.trim()}
      style={{ left: position.x, top: position.y, width: panelWidth, zIndex }}
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
