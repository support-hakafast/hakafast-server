import React from 'react';
import { createEmptyKartType } from '../utils/kartTypes.js';

export default function KartTypesEditor({ t, types, onChange, compact = false }) {
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

  return (
    <div className={`kart-types-editor${compact ? ' kart-types-editor-compact' : ''}`}>
      <p className="kart-types-editor-hint">{t('admin_kart_types_hint')}</p>
      <ul className="kart-types-list">
        {types.map((type, index) => (
          <li key={type.id} className="kart-type-row">
            <input
              type="color"
              className="kart-type-color-input"
              value={type.color}
              onChange={(e) => updateType(index, { color: e.target.value })}
              aria-label={t('admin_kart_type_color')}
            />
            <input
              type="text"
              className="kart-type-name-input"
              value={type.name}
              onChange={(e) => updateType(index, { name: e.target.value })}
              placeholder={t('admin_kart_type_name_ph')}
            />
            <button
              type="button"
              className="kart-type-remove"
              onClick={() => removeType(index)}
              disabled={types.length <= 2}
              aria-label={t('admin_kart_type_remove')}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="kart-type-add" onClick={addType}>
        {t('admin_kart_type_add')}
      </button>
    </div>
  );
}
