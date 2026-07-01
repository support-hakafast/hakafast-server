import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function HeatResultsQr({ url, size = 160, label, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    QRCode.toCanvas(canvas, url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    }).catch(() => {});
  }, [url, size]);

  if (!url) return null;

  return (
    <div className={`heat-results-qr-wrap ${className}`.trim()}>
      <canvas ref={canvasRef} className="heat-results-qr" aria-label={label || url} />
      {label ? <p className="heat-results-qr-label">{label}</p> : null}
      <p className="heat-results-qr-url">{url}</p>
    </div>
  );
}
