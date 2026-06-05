import React from 'react';
import { Link } from 'react-router-dom';
import logoSrc from '../assets/logo.png';

export default function HakafastLogo({ to = '/', className = '', showText = false }) {
  const img = (
    <img
      src={logoSrc}
      alt="HAKAFAST"
      className={`hf-logo-img ${className}`.trim()}
      width={160}
      height={48}
      decoding="async"
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
