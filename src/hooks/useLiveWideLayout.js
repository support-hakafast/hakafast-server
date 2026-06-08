import { useEffect, useState } from 'react';

export const LIVE_WIDE_MIN_PX = 1200;

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
