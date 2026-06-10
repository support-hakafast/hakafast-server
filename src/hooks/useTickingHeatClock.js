import { useEffect, useMemo, useState } from 'react';
import { tickHeatClockDisplay } from '../utils/adminHelpers.js';

function shouldTick(clock) {
  if (!clock?.startedAt) return false;
  if (clock.racePhase === 'checkered' || clock.racePhase === 'formation' || clock.racePhase === 'last_lap') {
    return false;
  }
  return Boolean(clock.running || clock.cooldownPhase);
}

/**
 * Interpolate heat clock every second from startedAt so live timing ticks sequentially
 * between WebSocket / poll updates.
 */
export function useTickingHeatClock(clock) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
  }, [clock?.startedAt, clock?.elapsedSec, clock?.remainingSec, clock?.running, clock?.racePhase]);

  useEffect(() => {
    if (!shouldTick(clock)) return undefined;

    let intervalId = null;
    const msToNext = 1000 - (Date.now() % 1000);
    const timeoutId = setTimeout(() => {
      setNow(Date.now());
      intervalId = setInterval(() => setNow(Date.now()), 1000);
    }, msToNext);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    clock?.startedAt,
    clock?.running,
    clock?.cooldownPhase,
    clock?.racePhase,
    clock?.durationMin,
    clock?.clockMode,
  ]);

  return useMemo(() => tickHeatClockDisplay(clock, now), [clock, now]);
}
