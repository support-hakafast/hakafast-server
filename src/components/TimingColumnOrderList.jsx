import React, { useCallback, useEffect, useRef, useState } from 'react';

export default function TimingColumnOrderList({ columns, onReorder, dragHint, getLabel }) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const dragIdRef = useRef(null);
  const overIdRef = useRef(null);

  const syncRefs = (drag, over) => {
    dragIdRef.current = drag;
    overIdRef.current = over;
  };

  const finishDrag = useCallback((targetId) => {
    const fromId = dragIdRef.current;
    const toId = targetId || overIdRef.current;
    if (fromId && toId && fromId !== toId) {
      onReorder(fromId, toId);
    }
    setDragId(null);
    setOverId(null);
    syncRefs(null, null);
  }, [onReorder]);

  const pickRowAt = useCallback((clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    const row = el?.closest?.('[data-column-id]');
    return row?.getAttribute('data-column-id') || null;
  }, []);

  useEffect(() => {
    if (!dragId) return undefined;

    const onMove = (e) => {
      const id = pickRowAt(e.clientX, e.clientY);
      if (id) {
        setOverId(id);
        overIdRef.current = id;
      }
    };

    const onUp = () => finishDrag(overIdRef.current);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragId, finishDrag, pickRowAt]);

  const handleGripPointerDown = (columnId, e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    setDragId(columnId);
    setOverId(columnId);
    syncRefs(columnId, columnId);
  };

  const handleDragStart = (columnId, e) => {
    setDragId(columnId);
    setOverId(columnId);
    syncRefs(columnId, columnId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnId);
  };

  const handleDragOver = (columnId, e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverId(columnId);
    overIdRef.current = columnId;
  };

  const handleDrop = (columnId, e) => {
    e.preventDefault();
    finishDrag(columnId);
  };

  if (!columns.length) return null;

  return (
    <div className="timing-order-table" role="list">
      {dragHint && <p className="timing-columns-intro">{dragHint}</p>}
      {columns.map((col) => {
        const isDragging = dragId === col.id;
        const isOver = overId === col.id && dragId && dragId !== col.id;
        return (
          <div
            key={col.id}
            role="listitem"
            data-column-id={col.id}
            className={`timing-order-row timing-order-row-draggable${isDragging ? ' is-dragging' : ''}${isOver ? ' is-drop-target' : ''}`}
            onDragOver={(e) => handleDragOver(col.id, e)}
            onDrop={(e) => handleDrop(col.id, e)}
          >
            <button
              type="button"
              className="timing-order-grip"
              aria-label={getLabel(col)}
              draggable
              onDragStart={(e) => handleDragStart(col.id, e)}
              onDragEnd={() => finishDrag(overIdRef.current)}
              onPointerDown={(e) => handleGripPointerDown(col.id, e)}
            >
              <span aria-hidden>⋮⋮</span>
            </button>
            <span className="timing-order-label">{getLabel(col)}</span>
          </div>
        );
      })}
    </div>
  );
}
