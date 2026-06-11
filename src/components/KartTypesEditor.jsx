import React from 'react';
import { createEmptyKartType, isDisallowedKartColor, sanitizeKartColor } from '../utils/kartTypes.js';

export default function KartTypesEditor({
  t,
  types,
  onChange,
  compact = false,
  showNumbers = false,
  numbersByType = {},
  onNumbersChange,
  onAddModel,
  colorRejectedMessage,
}) {
  const updateType = (index, patch) => {
    onChange(types.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeType = (index) => {
    if (types.length <= 2) return;
    onChange(types.filter((_, i) => i !== index));
  };

  const addType = () => {
    onChange([...types, createEmptyKartType(types.length)]);
  };

  const handleColorChange = (index, rawColor) => {
    if (isDisallowedKartColor(rawColor)) {
      if (colorRejectedMessage) window.alert(colorRejectedMessage);
      updateType(index, { color: sanitizeKartColor(types[index]?.color, index) });
      return;
    }
    updateType(index, { color: sanitizeKartColor(rawColor, index) });
  };

  return (
    <div className={`kart-types-editor${compact ? ' kart-types-editor-compact' : ''}${showNumbers ? ' kart-types-editor-inventory' : ''}`}>
      <p className="kart-types-editor-hint">
        {showNumbers ? t('admin_kart_types_inventory_hint') : t('admin_kart_types_hint')}
      </p>
      <ul className="kart-types-list">
        {types.map((type, index) => (
          <li key={type.id} className={`kart-type-row${showNumbers ? ' kart-type-row-inventory' : ''}`}>
            <input
              type="color"
              className="kart-type-color-input"
              value={type.color}
              onChange={(e) => handleColorChange(index, e.target.value)}
              aria-label={t('admin_kart_type_color')}
            />
            <div className="kart-type-row-fields">
              <input
                type="text"
                className="kart-type-name-input"
                value={type.name}
                onChange={(e) => updateType(index, { name: e.target.value })}
                placeholder={t('admin_kart_type_name_ph')}
              />
              {showNumbers && (
                <input
                  type="text"
                  className="kart-type-numbers-input"
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
              )}
            </div>
            <div className="kart-type-row-actions">
              {showNumbers && (
                <button
                  type="button"
                  className="kart-type-add-one"
                  onClick={() => onAddModel?.(type.id)}
                  title={t('admin_add_inventory')}
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
      <div className="kart-types-editor-footer">
        <button type="button" className="kart-type-add" onClick={addType}>
          {t('admin_kart_type_add')}
        </button>
        {showNumbers && (
          <button type="button" className="kart-type-add-all" onClick={() => onAddModel?.('all')}>
            {t('admin_kart_types_add_all')}
          </button>
        )}
      </div>
    </div>
  );
}
