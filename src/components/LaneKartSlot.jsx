import React, { useCallback, useEffect, useRef, useState } from 'react';

function slotKey(laneId, laneIndex) {
  return `${laneId}:${laneIndex}`;
}

export default function LaneKartSlot({
  laneId,
  laneIndex,
  onReorder,
  onDropOnSlot,
  children,
}) {
  const key = slotKey(laneId, laneIndex);
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const dragKeyRef = useRef(null);
  const overKeyRef = useRef(null);

  const syncRefs = (drag, over) => {
    dragKeyRef.current = drag;
    overKeyRef.current = over;
  };

  const finishDrag = useCallback((targetKey) => {
    const fromKey = dragKeyRef.current;
    const toKey = targetKey || overKeyRef.current;
    if (fromKey && toKey && fromKey !== toKey) {
      const [fromLane, fromIdx] = fromKey.split(':');
      const [toLane, toIdx] = toKey.split(':');
      if (fromLane === toLane) {
        onReorder(fromLane, parseInt(fromIdx, 10), parseInt(toIdx, 10));
      }
    }
    setDragKey(null);
    setOverKey(null);
    syncRefs(null, null);
  }, [onReorder]);

  const pickSlotAt = useCallback((clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    const row = el?.closest?.('[data-lane-slot]');
    return row?.getAttribute('data-lane-slot') || null;
  }, []);

  useEffect(() => {
    if (!dragKey) return undefined;

    const onMove = (e) => {
      const id = pickSlotAt(e.clientX, e.clientY);
      if (id) {
        setOverKey(id);
        overKeyRef.current = id;
      }
    };

    const onUp = () => finishDrag(overKeyRef.current);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragKey, finishDrag, pickSlotAt]);

  const handleGripPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    setDragKey(key);
    setOverKey(key);
    syncRefs(key, key);
  };

  const handleGripDragStart = (e) => {
    e.stopPropagation();
    setDragKey(key);
    setOverKey(key);
    syncRefs(key, key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setOverKey(key);
    overKeyRef.current = key;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData('text');
    if (raw.includes(':') && !raw.startsWith('{')) {
      finishDrag(key);
      return;
    }
    onDropOnSlot?.(e, laneId, laneIndex);
  };

  const isDragging = dragKey === key;
  const isOver = overKey === key && dragKey && dragKey !== key;

  return (
    <div
      className={`lane-kart-slot${isDragging ? ' is-dragging' : ''}${isOver ? ' is-drop-target' : ''}`}
      data-lane-slot={key}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <button
        type="button"
        className="lane-kart-grip"
        aria-label={`#${laneIndex + 1}`}
        draggable
        onDragStart={handleGripDragStart}
        onDragEnd={() => finishDrag(overKeyRef.current)}
        onPointerDown={handleGripPointerDown}
      >
        <span aria-hidden>⋮⋮</span>
      </button>
      <div className="lane-kart-body">{children}</div>
    </div>
  );
}
