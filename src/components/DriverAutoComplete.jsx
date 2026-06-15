import React, { useCallback, useEffect, useRef, useState } from 'react';
import { searchDriverProfiles } from '../utils/driverProfiles.js';

/**
 * Combobox-style input that suggests known drivers from the track's profile cache.
 * Used in EnduranceTeamsEditor and Reception for quick driver selection.
 */
export default function DriverAutoComplete({
  t,
  trackSlug,
  value,
  onChange,
  onSelect,
  placeholder = '',
  nameOnly = false,
  disabled = false,
  autoFocus = false,
  tabIndex = 0,
  className = '',
  showWeight = true,
  showNationality = true,
}) {
  const [inputValue, setInputValue] = useState(value?.name || value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const focusRef = useRef(false);

  // Sync external value changes
  useEffect(() => {
    const displayValue = typeof value === 'object' ? value?.name || '' : value || '';
    setInputValue(displayValue);
  }, [value]);

  const updateSuggestions = useCallback((text) => {
    if (!text?.trim() || !trackSlug) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const results = searchDriverProfiles(trackSlug, text, 10);
    setSuggestions(results);
    setShowDropdown(results.length > 0);
    setSelectedIndex(-1);
  }, [trackSlug]);

  const handleInputChange = (e) => {
    const text = e.target.value;
    setInputValue(text);
    onChange?.(nameOnly ? text : { name: text, weightKg: null, starter: false, nationality: '' });
    updateSuggestions(text);
  };

  const applySuggestion = useCallback((profile) => {
    const displayName = profile.name;
    setInputValue(displayName);
    setShowDropdown(false);
    setSuggestions([]);
    if (nameOnly) {
      onChange?.(displayName);
    } else {
      onChange?.({
        name: displayName,
        weightKg: profile.weightKg,
        nationality: profile.nationality || '',
        starter: false,
        phone: profile.phone || '',
        level: profile.level || '',
      });
    }
    onSelect?.(profile);
    inputRef.current?.focus();
  }, [nameOnly, onChange, onSelect]);

  const handleKeyDown = (e) => {
    if (!showDropdown || !suggestions.length) {
      if (e.key === 'Enter') {
        onSelect?.(null);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          applySuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        break;
      default:
        break;
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      if (!focusRef.current) setShowDropdown(false);
    }, 200);
  };

  return (
    <div className={`driver-autocomplete ${className}`} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        dir="auto"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { focusRef.current = true; updateSuggestions(inputValue); }}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        tabIndex={tabIndex}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls="driver-suggestions"
        autoComplete="off"
        className="driver-autocomplete-input"
      />

      {showDropdown && suggestions.length > 0 && (
        <ul
          ref={dropdownRef}
          id="driver-suggestions"
          className="driver-autocomplete-dropdown"
          role="listbox"
          onMouseDown={() => { focusRef.current = true; }}
        >
          <li className="driver-autocomplete-hint" aria-hidden>
            {suggestions.length} {t('admin_driver_suggestions')}
          </li>
          {suggestions.map((profile, idx) => (
            <li
              key={profile.name + profile.weightKg}
              role="option"
              aria-selected={idx === selectedIndex}
              className={`driver-autocomplete-item${idx === selectedIndex ? ' is-selected' : ''}`}
              onMouseDown={() => applySuggestion(profile)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <span className="driver-autocomplete-name">{profile.name}</span>
              <span className="driver-autocomplete-meta">
                {showWeight && profile.weightKg && <span className="driver-autocomplete-weight">{profile.weightKg}kg</span>}
                {showNationality && profile.nationality && <span className="driver-autocomplete-flag">{profile.nationality}</span>}
                {profile.level && <span className="driver-autocomplete-level">{profile.level}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}