import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { apiFetch } from '../utils/apiClient.js';
import '../assets/EmbedPages.css';

const SLOT_OPTIONS = [
  { id: 'morning', labelHe: 'בוקר', labelEn: 'Morning' },
  { id: 'afternoon', labelHe: 'אחה"צ', labelEn: 'Afternoon' },
  { id: 'evening', labelHe: 'ערב', labelEn: 'Evening' },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStart(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthEnd(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

function dayStatusClass(status) {
  if (status === 'closed') return 'closed';
  if (status === 'busy') return 'busy';
  if (status === 'full') return 'full';
  if (status === 'limited') return 'limited';
  return 'open';
}

function slotStatusLabel(status, he) {
  if (status === 'open') return he ? 'פנוי' : 'Open';
  if (status === 'limited') return he ? 'מוגבל' : 'Limited';
  if (status === 'full') return he ? 'מלא' : 'Full';
  return he ? 'סגור' : 'Closed';
}

async function loadAvailability(trackSlug, from, to) {
  try {
    const pub = await fetch(`/api/public/track/${encodeURIComponent(trackSlug)}/availability?from=${from}&to=${to}`);
    if (pub.ok) {
      const data = await pub.json();
      if (data.success) return data;
    }
  } catch { /* fallback */ }
  const res = await apiFetch(`/api/availability?from=${from}&to=${to}`, {}, trackSlug);
  if (!res.ok) return null;
  return res.json();
}

export default function EmbedBookingPage() {
  const { track } = useParams();
  const { lang } = useLanguage();
  const trackSlug = track || 'kart-demo';
  const he = lang === 'he';

  const [settings, setSettings] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(todayStr());
  const [availability, setAvailability] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [preferredSlot, setPreferredSlot] = useState(null);
  const [step, setStep] = useState('calendar');
  const [groupSize, setGroupSize] = useState(1);
  const [heatsPerPerson, setHeatsPerPerson] = useState(1);
  const [consecutive, setConsecutive] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(null);

  const from = monthStart(calendarMonth);
  const to = monthEnd(calendarMonth);

  const reload = useCallback(async () => {
    const [stRes, av] = await Promise.all([
      apiFetch('/api/booking-settings', {}, trackSlug).then((r) => (r.ok ? r.json() : null)),
      loadAvailability(trackSlug, from, to),
    ]);
    if (stRes?.bookingSettings) setSettings(stRes.bookingSettings);
    if (av?.days) setAvailability(av.days);
  }, [trackSlug, from, to]);

  useEffect(() => { reload(); }, [reload]);

  const dayMap = useMemo(() => {
    const m = new Map();
    availability.forEach((d) => m.set(d.date, d));
    return m;
  }, [availability]);

  const calendarCells = useMemo(() => {
    const first = new Date(`${from}T12:00:00`);
    const startPad = first.getDay();
    const daysInMonth = new Date(`${to}T12:00:00`).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push(date);
    }
    return cells;
  }, [from, to]);

  const maxHeats = settings?.maxHeatsPerPerson || 3;
  const requirePhone = settings?.requirePhone || false;
  const allowConsecutive = settings?.allowConsecutive !== false;
  const totalHeats = groupSize * heatsPerPerson;

  function selectDate(date) {
    if (date < todayStr()) return;
    const day = dayMap.get(date);
    if (!day || day.dayStatus === 'closed') return;
    setSelectedDate(date);
    setSelectedDay(day);
    setPreferredSlot(null);
    setStep('slots');
    setError('');
  }

  async function submitBooking() {
    setSubmitting(true);
    setError('');
    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      groupSize,
      heatsPerPerson,
      consecutive: groupSize === 1 && allowConsecutive ? consecutive : false,
      preferredSlot,
      preferredDate: selectedDate,
      note: note.trim(),
      source: 'website',
    };
    try {
      let result = null;
      try {
        const pub = await fetch(`/api/public/track/${encodeURIComponent(trackSlug)}/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        result = await pub.json();
      } catch { /* fallback */ }
      if (!result?.success) {
        const res = await apiFetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }, trackSlug);
        result = await res.json();
      }
      if (result.success) {
        setBooking(result.booking);
        setStep('done');
        reload();
      } else {
        const errKey = result.error || 'failed';
        const messages = {
          slot_unavailable: he ? 'המשבצת מלאה — בחרו זמן אחר' : 'Slot full — pick another time',
          capacity_exceeded: he ? 'אין מספיק מקומות למספר המקצים שביקשתם' : 'Not enough capacity for requested heats',
          day_closed: he ? 'היום סגור להזמנות' : 'This day is closed for bookings',
          name_required: he ? 'יש להזין שם' : 'Name is required',
          phone_required: he ? 'יש להזין טלפון' : 'Phone is required',
        };
        setError(messages[errKey] || (he ? 'לא ניתן להשלים את ההזמנה' : 'Could not complete booking'));
      }
    } catch {
      setError(he ? 'שגיאת חיבור' : 'Connection error');
    } finally {
      setSubmitting(false);
    }
  }

  if (settings && !settings.enabled) {
    return (
      <div className="emb-root">
        <div className="emb-card emb-unavailable">
          <h1>{he ? 'הזמנות אינטרנט סגורות' : 'Online bookings closed'}</h1>
          <p>{he ? 'צרו קשר עם המסלול.' : 'Please contact the track.'}</p>
        </div>
      </div>
    );
  }

  if (step === 'done' && booking) {
    return (
      <div className="emb-root" dir={he ? 'rtl' : 'ltr'}>
        <div className="emb-card emb-done">
          <div className="emb-done-icon">✅</div>
          <h1>{he ? 'ההזמנה נשמרה!' : 'Booking saved!'}</h1>
          <p>{he ? 'המסלול יאשר את המועד בקרוב.' : 'The track will confirm your slot soon.'}</p>
          <div className="emb-summary">
            <div><span>{he ? 'תאריך:' : 'Date:'}</span> <strong>{booking.preferredDate || selectedDate}</strong></div>
            <div><span>{he ? 'שם:' : 'Name:'}</span> <strong>{booking.name}</strong></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="emb-root emb-booking" dir={he ? 'rtl' : 'ltr'}>
      <div className="emb-card">
        <header className="emb-header">
          <h1>{he ? 'הזמנת מקצה' : 'Book a session'}</h1>
          <p className="emb-lead">{he ? 'בחרו תאריך — רואים מה פנוי לפני שמתחייבים' : 'Pick a date — see availability before you commit'}</p>
        </header>

        {step === 'calendar' && (
          <>
            <div className="emb-cal-nav">
              <button type="button" onClick={() => setCalendarMonth(addDays(from, -1))}>‹</button>
              <span>{new Date(`${from}T12:00:00`).toLocaleDateString(he ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' })}</span>
              <button type="button" onClick={() => setCalendarMonth(addDays(to, 1))}>›</button>
            </div>
            <div className="emb-cal-grid emb-cal-head">
              {(he ? ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="emb-cal-grid">
              {calendarCells.map((date, i) => {
                if (!date) return <span key={`pad-${i}`} className="emb-cal-pad" />;
                const day = dayMap.get(date);
                const past = date < todayStr();
                const status = day?.dayStatus || 'open';
                const marker = day?.marker;
                return (
                  <button
                    key={date}
                    type="button"
                    className={`emb-cal-day ${dayStatusClass(status)}${past ? ' past' : ''}${selectedDate === date ? ' selected' : ''}`}
                    disabled={past || status === 'closed'}
                    onClick={() => selectDate(date)}
                    title={marker?.labelHe || marker?.labelEn || ''}
                  >
                    <span className="emb-cal-num">{Number(date.slice(8))}</span>
                    {marker && <span className="emb-cal-marker" aria-hidden>!</span>}
                    {status === 'busy' && <span className="emb-cal-busy">{he ? 'עמוס' : 'Busy'}</span>}
                  </button>
                );
              })}
            </div>
            <div className="emb-legend">
              <span><i className="open" /> {he ? 'פנוי' : 'Open'}</span>
              <span><i className="limited" /> {he ? 'מוגבל' : 'Limited'}</span>
              <span><i className="busy" /> {he ? 'חג / עמוס' : 'Holiday / busy'}</span>
              <span><i className="closed" /> {he ? 'סגור' : 'Closed'}</span>
            </div>
          </>
        )}

        {step === 'slots' && selectedDay && (
          <>
            <button type="button" className="emb-back" onClick={() => setStep('calendar')}>
              {he ? '← חזרה ללוח' : '← Back to calendar'}
            </button>
            <h2 className="emb-subtitle">
              {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(he ? 'he-IL' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            {(selectedDay.messageHe || selectedDay.messageEn) && (
              <div className="emb-alert emb-alert-busy">
                {he ? selectedDay.messageHe : (selectedDay.messageEn || selectedDay.messageHe)}
              </div>
            )}
            {selectedDay.dayStatus === 'busy' && !selectedDay.messageHe && (
              <div className="emb-alert emb-alert-busy">
                {he ? 'יום עמוס — מומלץ להזמין מראש או לבחור שעה מוקדמת' : 'Busy day — book early or choose an off-peak slot'}
              </div>
            )}
            <div className="emb-slot-list">
              {selectedDay.slots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  className={`emb-slot ${slot.status}${preferredSlot === slot.id ? ' active' : ''}`}
                  disabled={slot.status === 'full' || slot.status === 'closed'}
                  onClick={() => setPreferredSlot(slot.id)}
                >
                  <span className="emb-slot-label">{he ? SLOT_OPTIONS.find((s) => s.id === slot.id)?.labelHe : SLOT_OPTIONS.find((s) => s.id === slot.id)?.labelEn}</span>
                  <span className="emb-slot-time">{slot.startTime}–{slot.endTime}</span>
                  <span className={`emb-slot-status ${slot.status}`}>{slotStatusLabel(slot.status, he)}</span>
                  {slot.status !== 'closed' && slot.status !== 'full' && (
                    <span className="emb-slot-cap">{he ? `~${slot.available} מקומות` : `~${slot.available} spots`}</span>
                  )}
                </button>
              ))}
            </div>
            {preferredSlot && (
              <button type="button" className="emb-btn-primary" onClick={() => setStep('details')}>
                {he ? 'המשך ←' : 'Continue →'}
              </button>
            )}
          </>
        )}

        {step === 'details' && (
          <>
            <button type="button" className="emb-back" onClick={() => setStep('slots')}>{he ? '← חזרה' : '← Back'}</button>
            <div className="emb-field">
              <label>{he ? 'כמה אנשים?' : 'How many people?'}</label>
              <div className="emb-stepper">
                <button type="button" onClick={() => setGroupSize((v) => Math.max(1, v - 1))}>−</button>
                <span>{groupSize}</span>
                <button type="button" onClick={() => setGroupSize((v) => v + 1)}>+</button>
              </div>
            </div>
            <div className="emb-field">
              <label>{he ? `מקצים לאדם (מקס׳ ${maxHeats})` : `Heats per person (max ${maxHeats})`}</label>
              <div className="emb-stepper">
                <button type="button" onClick={() => setHeatsPerPerson((v) => Math.max(1, v - 1))}>−</button>
                <span>{heatsPerPerson}</span>
                <button type="button" onClick={() => setHeatsPerPerson((v) => Math.min(maxHeats, v + 1))}>+</button>
              </div>
            </div>
            {totalHeats > 1 && <p className="emb-chip">{he ? `סה"כ ${totalHeats} מקצים` : `Total: ${totalHeats} heats`}</p>}
            <div className="emb-field">
              <label>{he ? 'שם מלא *' : 'Full name *'}</label>
              <input type="text" dir="auto" value={name} onChange={(e) => setName(e.target.value)} className="emb-input" />
            </div>
            <div className="emb-field">
              <label>{he ? `טלפון${requirePhone ? ' *' : ''}` : `Phone${requirePhone ? ' *' : ''}`}</label>
              <input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className="emb-input" />
            </div>
            <div className="emb-field">
              <label>{he ? 'הערה' : 'Note'}</label>
              <textarea dir="auto" value={note} onChange={(e) => setNote(e.target.value)} className="emb-input" rows={2} />
            </div>
            {error && <p className="emb-error">{error}</p>}
            <button
              type="button"
              className="emb-btn-primary"
              disabled={submitting || !name.trim()}
              onClick={() => {
                if (requirePhone && !phone.trim()) {
                  setError(he ? 'יש להזין טלפון' : 'Phone is required');
                  return;
                }
                submitBooking();
              }}
            >
              {submitting ? (he ? 'שולח...' : 'Submitting...') : (he ? 'שלח הזמנה' : 'Submit booking')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
