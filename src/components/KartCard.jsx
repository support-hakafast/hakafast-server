import React from 'react';

function KartSvg() {
  return (
    <svg className="kart-svg" viewBox="0 0 100 56" aria-hidden="true">
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
  onToggle,
  onLaunch,
  launchLabel,
  draggable,
  variant = 'pool',
}) {
  const inactive = !kart.active;

  return (
    <div
      className={`kart-shape kart-variant-${variant}${inactive ? ' is-disabled' : ''}`}
      draggable={draggable && kart.active}
      onDragStart={(e) => {
        if (!kart.active) { e.preventDefault(); return; }
        e.dataTransfer.setData('text', String(num));
      }}
      title={`#${num}`}
    >
      <KartSvg />
      <span className="kart-number">{num}</span>
      <button type="button" className="kart-toggle-btn" onClick={(e) => onToggle(num, e)}>
        {kart.active ? '×' : '+'}
      </button>
      {variant === 'exiting' && onLaunch && kart.active && (
        <button
          type="button"
          className="kart-launch-btn"
          onClick={(e) => { e.stopPropagation(); onLaunch(num); }}
        >
          {launchLabel}
        </button>
      )}
      {variant === 'exiting' && <span className="kart-exit-glow" aria-hidden />}
    </div>
  );
}
