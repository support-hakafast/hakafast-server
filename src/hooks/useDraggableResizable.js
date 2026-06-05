import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_W = 280;
const MIN_H = 200;

function readStored(storageKey, fallback) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return fallback;
}

export function useDraggableResizable(storageKey, defaults) {
  const [rect, setRect] = useState(() => readStored(storageKey, defaults));
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(rect));
    } catch {
      /* ignore */
    }
  }, [rect, storageKey]);

  const onDragStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      left: rect.left,
      top: rect.top,
    };
  }, [rect.left, rect.top]);

  const onResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      width: rect.width,
      height: rect.height,
    };
  }, [rect.width, rect.height]);

  useEffect(() => {
    const onMove = (e) => {
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setRect((r) => ({
          ...r,
          left: Math.max(8, Math.min(window.innerWidth - r.width - 8, dragRef.current.left + dx)),
          top: Math.max(8, Math.min(window.innerHeight - 80, dragRef.current.top + dy)),
        }));
      }
      if (resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        setRect((r) => ({
          ...r,
          width: Math.max(MIN_W, Math.min(window.innerWidth - r.left - 8, resizeRef.current.width + dx)),
          height: Math.max(MIN_H, Math.min(window.innerHeight - r.top - 8, resizeRef.current.height + dy)),
        }));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return { rect, onDragStart, onResizeStart };
}
