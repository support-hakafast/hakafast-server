import React, { useState } from 'react';

function KartSvg() {
  return (
    <svg className="kart-svg" viewBox="0 0 100 56" aria-hidden="true" draggable={false}>
      <path
        className="kart-shell"
        d="M8 34 L18 20 L36 14 L64 14 L82 20 L92 34 L88 42 L70 48 L30 48 L12 42 Z"
      />
      <path className="kart-cage" d="M22 22 L38 18 L62 18 L78 22 L84 32" />
      <circle className="kart-wheel" cx="30" cy="44" r="6" />
      <circle className="kart-wheel" cx="70" cy="44" r="6" />
      <rect className="kart-seat" x="42" y="24" width="16" height="10" rx="2" />
    </svg>
  );
}

export default function KartCard({
  num,
  kart,
  modelColor = null,
  modelName = null,
  onToggle,
  draggable,
  variant = 'pool',
  transponderActive = false,
  showToggle = false,
  laneId = null,
  laneIndex = -1,
}) {
  const inactive = !kart.active;
  const [dragging, setDragging] = useState(false);
  const canDrag = Boolean(draggable) && !inactive;
  const shellStyle = modelColor ? { '--kart-shell-fill': modelColor } : undefined;

  return (
    <div
      className={`kart-shape kart-variant-${variant}${modelColor ? ' has-model' : ''}${inactive ? ' is-disabled' : ''}${transponderActive ? ' transponder-active' : ''}${dragging ? ' is-dragging' : ''}`}
      style={shellStyle}
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) { e.preventDefault(); return; }
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        if (laneId != null && laneIndex >= 0) {
          e.dataTransfer.setData('text', JSON.stringify({ num, laneId, laneIndex }));
        } else {
          e.dataTransfer.setData('text', String(num));
        }
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      title={modelName ? `#${num} · ${modelName}` : `#${num}`}
    >
      <KartSvg />
      <span className="kart-number">{num}</span>
      {showToggle && onToggle && (
        <button type="button" className="kart-toggle-btn" onClick={(e) => onToggle(num, e)}>
          {kart.active ? '×' : '+'}
        </button>
      )}
      {variant === 'exiting' && transponderActive && <span className="kart-transponder-pulse" aria-hidden />}
      {variant === 'exiting' && <span className="kart-exit-glow" aria-hidden />}
    </div>
  );
}
