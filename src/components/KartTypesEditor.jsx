import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createEmptyKartType,
  formatKartTypeLabel,
  KART_COLOR_PRESETS,
  sanitizeKartColor,
} from '../utils/kartTypes.js';

function KartTypeMiniModal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="kart-type-mini-overlay" role="presentation" onClick={onClose}>
      <div
        className="kart-type-mini-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kart-type-mini-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="kart-type-mini-close" onClick={onClose} aria-label="×">×</button>
        <h3 id="kart-type-mini-title" className="kart-type-mini-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ColorPickerModal({ t, type, index, onPick, onClose }) {
  const customInputRef = useRef(null);
  const label = formatKartTypeLabel(type) || t('admin_kart_type_color');

  return (
    <KartTypeMiniModal title={t('admin_kart_type_color_pick', { label })} onClose={onClose}>
      <div className="kart-color-palette" role="listbox" aria-label={t('admin_kart_type_color')}>
        {KART_COLOR_PRESETS.map((hex) => (
          <button
            key={hex}
            type="button"
            role="option"
            aria-selected={type.color === hex}
            className={`kart-color-swatch-btn${type.color === hex ? ' is-selected' : ''}`}
            style={{ backgroundColor: hex }}
            title={hex}
            onClick={() => {
              onPick(index, hex);
              onClose();
            }}
          />
        ))}
      </div>
      <input
        ref={customInputRef}
        type="color"
        className="kart-color-custom-input"
        value={type.color}
        onChange={(e) => onPick(index, e.target.value)}
        aria-hidden
        tabIndex={-1}
      />
      <button
        type="button"
        className="kart-color-custom-trigger"
        onClick={() => customInputRef.current?.click()}
      >
        {t('admin_kart_type_color_custom')}
      </button>
    </KartTypeMiniModal>
  );
}

function AddKartsModal({
  t,
  type,
  numbersValue,
  onNumbersChange,
  onAdd,
  onClose,
}) {
  const label = formatKartTypeLabel(type) || type.name || t('admin_kart_type_select');

  const submit = () => {
    onAdd?.(type.id);
    onClose();
  };

  return (
    <KartTypeMiniModal title={t('admin_kart_type_add_modal_title', { label })} onClose={onClose}>
      <div className="kart-type-add-modal-head">
        <span className="kart-type-add-modal-swatch" style={{ backgroundColor: type.color }} aria-hidden />
        <p className="kart-type-add-modal-hint">{t('admin_kart_type_add_modal_hint')}</p>
      </div>
      <input
        type="text"
        className="kart-type-numbers-input"
        value={numbersValue}
        onChange={(e) => onNumbersChange?.(type.id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={t('admin_kart_type_numbers_ph')}
        autoFocus
      />
      <div className="kart-type-mini-actions">
        <button type="button" className="kart-type-mini-cancel" onClick={onClose}>
          {t('modal_cancel')}
        </button>
        <button type="button" className="kart-type-mini-submit" onClick={submit}>
          {t('admin_add_inventory')}
        </button>
      </div>
    </KartTypeMiniModal>
  );
}

export default function KartTypesEditor({
  t,
  types,
  onChange,
  compact = false,
  showNumbers = false,
  numbersByType = {},
  onNumbersChange,
  onAddModel,
}) {
  const [colorModalIndex, setColorModalIndex] = useState(null);
  const [addModalTypeId, setAddModalTypeId] = useState(null);

  const updateType = (index, patch) => {
    onChange(types.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeType = (index) => {
    if (types.length <= 2) return;
    onChange(types.filter((_, i) => i !== index));
  };

  const addType = () => {
    const draft = createEmptyKartType(types.length);
    draft.name = t('admin_kart_type_new_default', { n: types.length + 1 });
    onChange([...types, draft]);
  };

  const handleColorChange = (index, rawColor) => {
    updateType(index, { color: sanitizeKartColor(rawColor, index) });
  };

  const addModalType = addModalTypeId
    ? types.find((row) => row.id === addModalTypeId)
    : null;

  const inventoryCompact = showNumbers && compact;

  return (
    <div className={`kart-types-editor${compact ? ' kart-types-editor-compact' : ''}${showNumbers ? ' kart-types-editor-inventory' : ''}${inventoryCompact ? ' kart-types-editor-inventory-compact' : ''}`}>
      <div className={`kart-types-editor-head${inventoryCompact ? ' kart-types-editor-head-compact' : ''}`}>
        <p className="kart-types-editor-hint">
          {showNumbers ? t('admin_kart_types_inventory_hint') : t('admin_kart_types_hint')}
        </p>
      </div>
      <ul className="kart-types-list">
        {types.map((type, index) => (
          <li
            key={type.id}
            className={[
              'kart-type-row',
              showNumbers ? 'kart-type-row-inventory' : '',
              inventoryCompact ? 'kart-type-row-compact' : '',
            ].filter(Boolean).join(' ')}
          >
            <button
              type="button"
              className="kart-type-color-swatch"
              style={{ backgroundColor: type.color }}
              onClick={() => setColorModalIndex(index)}
              title={t('admin_kart_type_color')}
              aria-label={t('admin_kart_type_color')}
            />
            <div className="kart-type-row-fields">
              <div className="kart-type-row-top">
                <input
                  type="text"
                  className="kart-type-name-input"
                  value={type.name}
                  onChange={(e) => updateType(index, { name: e.target.value })}
                  placeholder={t('admin_kart_type_name_ph')}
                />
                <input
                  type="text"
                  className="kart-type-engine-input"
                  value={type.engineCc || ''}
                  onChange={(e) => updateType(index, { engineCc: e.target.value })}
                  placeholder={t('admin_kart_type_engine_ph')}
                  title={t('admin_kart_type_engine_hint')}
                />
              </div>
              {showNumbers && (
                <label className="kart-type-numbers-field">
                  <span className="kart-type-numbers-field-label">{t('admin_kart_numbers_by_model')}</span>
                  <input
                    type="text"
                    className={`kart-type-numbers-input${inventoryCompact ? ' kart-type-numbers-input-compact' : ''}`}
                    value={numbersByType[type.id] || ''}
                    onChange={(e) => onNumbersChange?.(type.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onAddModel?.(type.id);
                      }
                    }}
                    placeholder={t('admin_kart_type_numbers_ph')}
                  />
                </label>
              )}
            </div>
            <div className="kart-type-row-actions">
              {showNumbers && (
                <button
                  type="button"
                  className="kart-type-add-one"
                  onClick={() => onAddModel?.(type.id)}
                  title={t('admin_add_inventory')}
                  aria-label={t('admin_add_inventory')}
                >
                  +
                </button>
              )}
              <button
                type="button"
                className="kart-type-remove"
                onClick={() => removeType(index)}
                disabled={types.length <= 2}
                aria-label={t('admin_kart_type_remove')}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className={`kart-types-editor-footer${inventoryCompact ? ' kart-types-editor-footer-compact' : ''}`}>
        <button type="button" className="kart-type-add" onClick={addType}>
          {t('admin_kart_type_add')}
        </button>
      </div>

      {colorModalIndex != null && types[colorModalIndex] && createPortal(
        <ColorPickerModal
          t={t}
          type={types[colorModalIndex]}
          index={colorModalIndex}
          onPick={handleColorChange}
          onClose={() => setColorModalIndex(null)}
        />,
        document.body,
      )}

      {addModalType && createPortal(
        <AddKartsModal
          t={t}
          type={addModalType}
          numbersValue={numbersByType[addModalType.id] || ''}
          onNumbersChange={onNumbersChange}
          onAdd={onAddModel}
          onClose={() => setAddModalTypeId(null)}
        />,
        document.body,
      )}
    </div>
  );
}
