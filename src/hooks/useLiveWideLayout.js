import { useEffect, useState } from 'react';

export const LIVE_WIDE_MIN_PX = 1200;
export const LIVE_ULTRA_MIN_PX = 1600;
export const LIVE_COMPACT_MAX_PX = 900;

export function useLiveWideLayout(minWidth = LIVE_WIDE_MIN_PX) {
  const [isWide, setIsWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(min-width: ${minWidth}px)`).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const sync = () => setIsWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [minWidth]);

  return isWide;
}

export function useLiveLayoutTier() {
  const [tier, setTier] = useState(() => {
    if (typeof window === 'undefined') return 'compact';
    const w = window.innerWidth;
    if (w >= LIVE_ULTRA_MIN_PX) return 'ultra';
    if (w >= LIVE_WIDE_MIN_PX) return 'wide';
    if (w <= LIVE_COMPACT_MAX_PX) return 'compact';
    return 'medium';
  });

  useEffect(() => {
    const sync = () => {
      const w = window.innerWidth;
      if (w >= LIVE_ULTRA_MIN_PX) setTier('ultra');
      else if (w >= LIVE_WIDE_MIN_PX) setTier('wide');
      else if (w <= LIVE_COMPACT_MAX_PX) setTier('compact');
      else setTier('medium');
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  return tier;
}
