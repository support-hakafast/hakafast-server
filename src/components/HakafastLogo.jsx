import React from 'react';
import { Link } from 'react-router-dom';

export default function HakafastLogo({ to = '/', className = '', showText = false }) {
  const img = (
    <img
      src="/assets/logo.png"
      alt="HAKAFAST"
      className={`hf-logo-img ${className}`.trim()}
    />
  );

  if (to) {
    return (
      <Link to={to} className="hf-logo-link">
        {img}
        {showText && <span className="hf-logo-text">HAKAFAST</span>}
      </Link>
    );
  }

  return img;
}
