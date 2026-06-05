import { useEffect, useRef, useState } from 'react';

export function useRowFlash(rows, getKey, watchFields) {
  const [flashingKeys, setFlashingKeys] = useState(() => new Set());
  const prevRef = useRef(new Map());

  useEffect(() => {
    const nextFlash = new Set();
    const nextPrev = new Map();

    rows.forEach((row) => {
      const key = getKey(row);
      const snapshot = {};
      watchFields.forEach((field) => {
        snapshot[field] = row[field];
      });

      const prev = prevRef.current.get(key);
      if (prev) {
        const changed = watchFields.some((field) => prev[field] !== snapshot[field]);
        if (changed) nextFlash.add(key);
      }
      nextPrev.set(key, snapshot);
    });

    prevRef.current = nextPrev;

    if (nextFlash.size > 0) {
      setFlashingKeys(nextFlash);
      const timer = setTimeout(() => setFlashingKeys(new Set()), 700);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [rows, getKey, watchFields]);

  return flashingKeys;
}
