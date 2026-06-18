import { useCallback, useEffect, useRef, useState } from 'react';

const DESKTOP_MIN_W = 280;
const DESKTOP_MIN_H = 200;
const VIEWPORT_MARGIN = 8;

function getViewportMinSize() {
  if (typeof window === 'undefined') {
    return { minW: DESKTOP_MIN_W, minH: DESKTOP_MIN_H };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const narrow = vw <= 768;
  return {
    minW: narrow ? Math.max(240, vw - VIEWPORT_MARGIN * 2) : DESKTOP_MIN_W,
    minH: narrow ? Math.max(140, Math.min(180, Math.round(vh * 0.22))) : DESKTOP_MIN_H,
  };
}

export function clampPreviewRect(rect, minW = DESKTOP_MIN_W, minH = DESKTOP_MIN_H) {
  if (!rect || typeof window === 'undefined') return rect ?? { left: 20, top: 200, width: minW, height: minH };
  const maxW = Math.max(minW, window.innerWidth - VIEWPORT_MARGIN * 2);
  const maxH = Math.max(minH, window.innerHeight - VIEWPORT_MARGIN * 2);
  const width = Math.min(Math.max(rect.width, minW), maxW);
  const height = Math.min(Math.max(rect.height, minH), maxH);
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
  );
  const top = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.top, window.innerHeight - height - VIEWPORT_MARGIN),
  );
  return { left, top, width, height };
}

export function getPreviewWindowDefaults() {
  if (typeof window === 'undefined') {
    return { left: 20, top: 200, width: 420, height: 340 };
  }
  const { minW, minH } = getViewportMinSize();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const narrow = vw <= 768;
  const width = narrow
    ? Math.max(minW, vw - VIEWPORT_MARGIN * 2)
    : Math.min(420, vw - VIEWPORT_MARGIN * 2);
  const height = narrow
    ? Math.min(Math.max(minH, Math.round(vh * 0.42)), vh - VIEWPORT_MARGIN * 2 - 48)
    : Math.min(340, Math.round(vh * 0.45), vh - VIEWPORT_MARGIN * 2 - 48);
  const left = narrow
    ? VIEWPORT_MARGIN
    : Math.max(VIEWPORT_MARGIN, Math.min(20, vw - width - VIEWPORT_MARGIN));
  const top = narrow
    ? Math.max(VIEWPORT_MARGIN, vh - height - VIEWPORT_MARGIN - 12)
    : Math.max(VIEWPORT_MARGIN, Math.min(vh - height - VIEWPORT_MARGIN, vh - 420));
  return clampPreviewRect({ left, top, width, height }, minW, minH);
}

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
  const [rect, setRect] = useState(() => {
    const base = readStored(storageKey, defaults);
    if (typeof window === 'undefined') return base;
    const { minW, minH } = getViewportMinSize();
    return clampPreviewRect(base, minW, minH);
  });
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(rect));
    } catch {
      /* ignore */
    }
  }, [rect, storageKey]);

  useEffect(() => {
    const onResize = () => {
      const { minW, minH } = getViewportMinSize();
      setRect((r) => clampPreviewRect(r, minW, minH));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

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
      const { minW, minH } = getViewportMinSize();
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setRect((r) => clampPreviewRect({
          ...r,
          left: dragRef.current.left + dx,
          top: dragRef.current.top + dy,
        }, minW, minH));
      }
      if (resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        setRect((r) => clampPreviewRect({
          ...r,
          width: resizeRef.current.width + dx,
          height: resizeRef.current.height + dy,
        }, minW, minH));
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
