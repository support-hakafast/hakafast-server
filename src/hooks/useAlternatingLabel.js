import { useEffect, useState } from 'react';

/**
 * Alternates between primary (e.g. team) and secondary (e.g. driver) labels.
 * Default cycle: 7s primary, 3s secondary — 10s total.
 */
export function useAlternatingLabel(primary, secondary, primaryMs = 7000, secondaryMs = 3000) {
  const [showPrimary, setShowPrimary] = useState(true);

  useEffect(() => {
    if (!primary || !secondary || primary === secondary) {
      setShowPrimary(true);
      return undefined;
    }
    let timer;
    const tick = () => {
      setShowPrimary((prev) => {
        const next = !prev;
        timer = setTimeout(tick, next ? primaryMs : secondaryMs);
        return next;
      });
    };
    timer = setTimeout(tick, primaryMs);
    return () => clearTimeout(timer);
  }, [primary, secondary, primaryMs, secondaryMs]);

  if (!secondary || primary === secondary) return primary || secondary || '—';
  if (!primary) return secondary || '—';
  return showPrimary ? primary : secondary;
}

export default useAlternatingLabel;
