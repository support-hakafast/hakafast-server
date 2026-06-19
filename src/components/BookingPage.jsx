import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { apiFetch } from '../utils/apiClient.js';
import '../assets/BookingPage.css';

const SLOT_OPTIONS = [
  { id: null,        label_he: 'אין העדפה',  label_en: 'No preference' },
  { id: 'morning',   label_he: 'בוקר',       label_en: 'Morning' },
  { id: 'afternoon', label_he: 'אחה"צ',      label_en: 'Afternoon' },
  { id: 'evening',   label_he: 'ערב',        label_en: 'Evening' },
];

const STEPS = ['type', 'details', 'confirm'];

export default function BookingPage() {
  const { track } = useParams();
  const { t, lang } = useLanguage();
  const trackSlug = track || 'kart-demo';

  const [settings, setSettings] = useState(null);
  const [step, setStep] = useState('type');   // 'type'|'details'|'confirm'|'done'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — booking type
  const [groupSize, setGroupSize] = useState(1);
  const [heatsPerPerson, setHeatsPerPerson] = useState(1);
  const [consecutive, setConsecutive] = useState(false);
  const [preferredSlot, setPreferredSlot] = useState(null);

  // Step 2 — personal details
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');

  // Result
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    apiFetch('/api/booking-settings', {}, trackSlug)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.bookingSettings && setSettings(d.bookingSettings))
      .catch(() => {});
  }, [trackSlug]);

  if (settings && !settings.enabled) {
    return (
      <div className="bp-root">
        <div className="bp-card bp-unavailable">
          <div className="bp-logo">🏁</div>
          <h1>{lang === 'he' ? 'הזמנות סגורות כעת' : 'Bookings are currently closed'}</h1>
          <p>{lang === 'he' ? 'אנא פנה לצוות הקבלה.' : 'Please contact the reception desk.'}</p>
        </div>
      </div>
    );
  }

  const maxHeats = settings?.maxHeatsPerPerson || 3;
  const allowConsecutive = settings?.allowConsecutive !== false;
  const requirePhone = settings?.requirePhone || false;
  const totalHeats = groupSize * heatsPerPerson;

  function nextStep() {
    if (step === 'type') { setStep('details'); return; }
    if (step === 'details') {
      if (!name.trim()) { setError(lang === 'he' ? 'יש להזין שם' : 'Name is required'); return; }
      if (requirePhone && !phone.trim()) { setError(lang === 'he' ? 'יש להזין טלפון' : 'Phone is required'); return; }
      setError('');
      setStep('confirm');
    }
  }

  function prevStep() {
    if (step === 'details') setStep('type');
    if (step === 'confirm') setStep('details');
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          groupSize,
          heatsPerPerson,
          consecutive: groupSize === 1 && allowConsecutive ? consecutive : false,
          preferredSlot,
          note: note.trim(),
          source: 'kiosk',
        }),
      }, trackSlug);
      const d = await res.json();
      if (d.success) {
        setBooking(d.booking);
        setStep('done');
      } else {
        setError(lang === 'he' ? 'שגיאה בשליחת ההזמנה' : 'Failed to submit booking');
      }
    } catch {
      setError(lang === 'he' ? 'שגיאת חיבור' : 'Connection error');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep('type');
    setGroupSize(1);
    setHeatsPerPerson(1);
    setConsecutive(false);
    setPreferredSlot(null);
    setName('');
    setPhone('');
    setNote('');
    setBooking(null);
    setError('');
  }

  const he = lang === 'he';

  if (step === 'done') {
    return (
      <div className="bp-root">
        <div className="bp-card bp-done">
          <div className="bp-done-icon">✅</div>
          <h1>{he ? 'ההזמנה התקבלה!' : 'Booking received!'}</h1>
          <p className="bp-done-sub">{he ? 'צוות הקבלה יאשר אותה בקרוב.' : 'The reception team will confirm it shortly.'}</p>
          <div className="bp-done-summary">
            <div><span>{he ? 'שם:' : 'Name:'}</span> <strong>{booking.name}</strong></div>
            {booking.phone && <div><span>{he ? 'טלפון:' : 'Phone:'}</span> <strong>{booking.phone}</strong></div>}
            <div><span>{he ? 'אנשים:' : 'Group:'}</span> <strong>{booking.groupSize}</strong></div>
            <div><span>{he ? 'מקצים לאדם:' : 'Heats/person:'}</span> <strong>{booking.heatsPerPerson}</strong></div>
            {booking.consecutive && <div><span>{he ? 'רצף:' : 'Consecutive:'}</span> <strong>{he ? 'כן' : 'Yes'}</strong></div>}
          </div>
          <button className="bp-btn-primary" onClick={reset}>
            {he ? 'הזמנה חדשה' : 'New Booking'}
          </button>
        </div>
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="bp-root" dir={he ? 'rtl' : 'ltr'}>
      <div className="bp-card">
        <div className="bp-header">
          <span className="bp-logo">🏁</span>
          <h1 className="bp-title">{he ? 'הזמנת מקצה' : 'Race Booking'}</h1>
        </div>

        {/* Progress */}
        <div className="bp-progress">
          {[
            { id: 'type',    label: he ? 'פרטי הזמנה' : 'Booking' },
            { id: 'details', label: he ? 'פרטים אישיים' : 'Details' },
            { id: 'confirm', label: he ? 'אישור' : 'Confirm' },
          ].map((s, i) => (
            <div key={s.id} className={`bp-step${step === s.id ? ' active' : ''}${i < stepIndex ? ' done' : ''}`}>
              <span className="bp-step-num">{i < stepIndex ? '✓' : i + 1}</span>
              <span className="bp-step-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Step 1 — Type */}
        {step === 'type' && (
          <div className="bp-section">
            <div className="bp-field">
              <label>{he ? 'כמה אנשים?' : 'How many people?'}</label>
              <div className="bp-stepper">
                <button type="button" onClick={() => setGroupSize((v) => Math.max(1, v - 1))}>−</button>
                <span className="bp-stepper-val">{groupSize}</span>
                <button type="button" onClick={() => setGroupSize((v) => v + 1)}>+</button>
              </div>
            </div>

            <div className="bp-field">
              <label>{he ? `כמה מקצים לכל אדם? (מקס׳ ${maxHeats})` : `Heats per person? (max ${maxHeats})`}</label>
              <div className="bp-stepper">
                <button type="button" onClick={() => setHeatsPerPerson((v) => Math.max(1, v - 1))}>−</button>
                <span className="bp-stepper-val">{heatsPerPerson}</span>
                <button type="button" onClick={() => setHeatsPerPerson((v) => Math.min(maxHeats, v + 1))}>+</button>
              </div>
            </div>

            {totalHeats > 1 && (
              <div className="bp-total-chip">
                {he ? `סה"כ ${totalHeats} מקצים` : `Total: ${totalHeats} heats`}
              </div>
            )}

            {groupSize === 1 && heatsPerPerson > 1 && allowConsecutive && (
              <div className="bp-field">
                <label>{he ? 'איך לשבץ?' : 'How to schedule?'}</label>
                <div className="bp-mode-tabs">
                  <button
                    type="button"
                    className={`bp-mode-tab${!consecutive ? ' active' : ''}`}
                    onClick={() => setConsecutive(false)}
                  >
                    <span>{he ? 'מפוזר' : 'Scattered'}</span>
                    <small>{he ? 'מנוחה בין מקצים' : 'Rest between heats'}</small>
                  </button>
                  <button
                    type="button"
                    className={`bp-mode-tab${consecutive ? ' active' : ''}`}
                    onClick={() => setConsecutive(true)}
                  >
                    <span>{he ? 'ברצף' : 'Consecutive'}</span>
                    <small>{he ? 'לא יורד מהקארט' : 'Stay in kart'}</small>
                  </button>
                </div>
              </div>
            )}

            <div className="bp-field">
              <label>{he ? 'מתי מועדף?' : 'Preferred time?'}</label>
              <div className="bp-slot-grid">
                {SLOT_OPTIONS.map((s) => (
                  <button
                    key={String(s.id)}
                    type="button"
                    className={`bp-slot-btn${preferredSlot === s.id ? ' active' : ''}`}
                    onClick={() => setPreferredSlot(s.id)}
                  >
                    {he ? s.label_he : s.label_en}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Personal details */}
        {step === 'details' && (
          <div className="bp-section">
            <div className="bp-field">
              <label>{he ? 'שם מלא *' : 'Full name *'}</label>
              <input
                type="text"
                dir="auto"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={he ? 'ישראל ישראלי' : 'John Smith'}
                className="bp-input"
                autoFocus
              />
            </div>
            <div className="bp-field">
              <label>{he ? `טלפון${requirePhone ? ' *' : ''}` : `Phone${requirePhone ? ' *' : ''}`}</label>
              <input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-0000000"
                className="bp-input"
              />
            </div>
            <div className="bp-field">
              <label>{he ? 'הערה (אופציונלי)' : 'Note (optional)'}</label>
              <textarea
                dir="auto"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={he ? 'לדוגמה: יום הולדת, מבוגרים בלבד...' : 'e.g. Birthday, adults only...'}
                className="bp-input bp-textarea"
                rows={2}
              />
            </div>
          </div>
        )}

        {/* Step 3 — Confirm */}
        {step === 'confirm' && (
          <div className="bp-section bp-confirm-section">
            <h2 className="bp-confirm-title">{he ? 'אישור הזמנה' : 'Confirm Booking'}</h2>
            <div className="bp-confirm-row"><span>{he ? 'שם' : 'Name'}</span><strong>{name}</strong></div>
            {phone && <div className="bp-confirm-row"><span>{he ? 'טלפון' : 'Phone'}</span><strong>{phone}</strong></div>}
            <div className="bp-confirm-row"><span>{he ? 'אנשים' : 'Group size'}</span><strong>{groupSize}</strong></div>
            <div className="bp-confirm-row"><span>{he ? 'מקצים לאדם' : 'Heats/person'}</span><strong>{heatsPerPerson}</strong></div>
            <div className="bp-confirm-row">
              <span>{he ? 'סה"כ מקצים' : 'Total heats'}</span>
              <strong className="bp-confirm-total">{totalHeats}</strong>
            </div>
            {groupSize === 1 && heatsPerPerson > 1 && (
              <div className="bp-confirm-row">
                <span>{he ? 'שיבוץ' : 'Schedule'}</span>
                <strong>{consecutive ? (he ? 'ברצף' : 'Consecutive') : (he ? 'מפוזר' : 'Scattered')}</strong>
              </div>
            )}
            {preferredSlot && (
              <div className="bp-confirm-row">
                <span>{he ? 'מועדף' : 'Preferred'}</span>
                <strong>{SLOT_OPTIONS.find((s) => s.id === preferredSlot)?.[he ? 'label_he' : 'label_en']}</strong>
              </div>
            )}
            {note && <div className="bp-confirm-row"><span>{he ? 'הערה' : 'Note'}</span><strong>{note}</strong></div>}
          </div>
        )}

        {error && <p className="bp-error">{error}</p>}

        {/* Navigation */}
        <div className="bp-nav">
          {step !== 'type' && (
            <button type="button" className="bp-btn-ghost" onClick={prevStep} disabled={submitting}>
              {he ? '← חזור' : '← Back'}
            </button>
          )}
          {step !== 'confirm' ? (
            <button type="button" className="bp-btn-primary" onClick={nextStep}>
              {he ? 'המשך ←' : 'Continue →'}
            </button>
          ) : (
            <button type="button" className="bp-btn-primary" onClick={submit} disabled={submitting}>
              {submitting ? (he ? 'שולח...' : 'Submitting...') : (he ? 'שלח הזמנה ✓' : 'Submit Booking ✓')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
