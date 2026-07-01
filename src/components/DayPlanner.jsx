import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/apiClient.js';
import TrackEmbedGuide from './TrackEmbedGuide.jsx';
import '../assets/DayPlanner.css';

const EVENT_TYPES = [
  { id: 'booking',     labelHe: 'הזמנה',       labelEn: 'Booking',     color: '#3b82f6' },
  { id: 'birthday',   labelHe: 'יום הולדת',   labelEn: 'Birthday',    color: '#ec4899' },
  { id: 'corporate',  labelHe: 'אירוע חברה',  labelEn: 'Corporate',   color: '#8b5cf6' },
  { id: 'private',    labelHe: 'אירוע פרטי',  labelEn: 'Private',     color: '#f59e0b' },
  { id: 'maintenance',labelHe: 'תחזוקה',      labelEn: 'Maintenance', color: '#6b7280' },
];

const BOOKING_STATUSES = [
  { id: 'pending',   labelHe: 'ממתין',  labelEn: 'Pending',   color: '#f59e0b' },
  { id: 'confirmed', labelHe: 'אושר',   labelEn: 'Confirmed', color: '#22c55e' },
  { id: 'queued',    labelHe: 'בתור',   labelEn: 'In queue',  color: '#3b82f6' },
  { id: 'done',      labelHe: 'הסתיים', labelEn: 'Done',      color: '#6b7280' },
  { id: 'cancelled', labelHe: 'בוטל',   labelEn: 'Cancelled', color: '#ef4444' },
];

const SLOT_LABELS = {
  morning:   { he: 'בוקר', en: 'Morning' },
  afternoon: { he: 'אחה"צ', en: 'Afternoon' },
  evening:   { he: 'ערב', en: 'Evening' },
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function parseMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function eventColor(type) {
  return EVENT_TYPES.find((t) => t.id === type)?.color || '#64748b';
}

function statusColor(status) {
  return BOOKING_STATUSES.find((s) => s.id === status)?.color || '#64748b';
}

// ── Timeline ────────────────────────────────────────────────────────────────

const HOUR_START = 8;
const HOUR_END   = 23;
const TOTAL_MIN  = (HOUR_END - HOUR_START) * 60;
const TIMELINE_H = 560; // px

function minuteToY(minutes) {
  const rel = minutes - HOUR_START * 60;
  return Math.max(0, Math.min(1, rel / TOTAL_MIN)) * TIMELINE_H;
}

function EventBlock({ ev, onClick }) {
  const top = minuteToY(parseMinutes(ev.startTime));
  const bot = minuteToY(parseMinutes(ev.endTime));
  const height = Math.max(22, bot - top);
  const color = eventColor(ev.type);
  return (
    <div
      className="dp-event-block"
      style={{ top, height, background: color + '22', borderColor: color, color }}
      onClick={() => onClick(ev)}
      title={`${ev.title} ${ev.startTime}–${ev.endTime}`}
    >
      <span className="dp-event-title">{ev.title}</span>
      <span className="dp-event-time">{ev.startTime}–{ev.endTime}</span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function DayPlanner({ trackSlug, t, isLicensed, onAddToQueue }) {
  const he = true; // always Hebrew for admin (can be wired to lang later)

  const [date, setDate] = useState(todayStr);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingSettings, setBookingSettings] = useState(null);
  const [loading, setLoading] = useState(false);

  // Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeTab, setActiveTab] = useState('planner'); // 'planner'|'bookings'|'settings'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, bkRes, stRes] = await Promise.all([
        apiFetch(`/api/scheduled-events?date=${date}`, {}, trackSlug),
        apiFetch('/api/bookings', {}, trackSlug),
        apiFetch('/api/booking-settings', {}, trackSlug),
      ]);
      if (evRes.ok) { const d = await evRes.json(); setEvents(d.events || []); }
      if (bkRes.ok) { const d = await bkRes.json(); setBookings(d.bookings || []); }
      if (stRes.ok) { const d = await stRes.json(); setBookingSettings(d.bookingSettings || null); }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [date, trackSlug]);

  useEffect(() => { load(); }, [load]);

  // ── Event CRUD ────────────────────────────────────────────────────────────

  async function saveEvent(data) {
    if (editingEvent?.id) {
      await apiFetch(`/api/scheduled-events/${editingEvent.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      }, trackSlug);
    } else {
      await apiFetch('/api/scheduled-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, date }),
      }, trackSlug);
    }
    setShowEventModal(false);
    setEditingEvent(null);
    load();
  }

  async function deleteEvent(id) {
    await apiFetch(`/api/scheduled-events/${id}`, { method: 'DELETE' }, trackSlug);
    setShowEventModal(false);
    setEditingEvent(null);
    load();
  }

  // ── Booking CRUD ──────────────────────────────────────────────────────────

  async function updateBookingStatus(id, status) {
    await apiFetch(`/api/bookings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    }, trackSlug);
    load();
  }

  async function deleteBooking(id) {
    await apiFetch(`/api/bookings/${id}`, { method: 'DELETE' }, trackSlug);
    setShowBookingModal(false);
    setEditingBooking(null);
    load();
  }

  async function sendToQueue(booking) {
    // Add driver(s) to the reception queue and mark booking as queued
    if (onAddToQueue) {
      const drivers = [];
      for (let g = 0; g < booking.groupSize; g++) {
        const driverName = booking.groupSize === 1
          ? booking.name
          : `${booking.name} (${g + 1}/${booking.groupSize})`;
        for (let h = 0; h < booking.heatsPerPerson; h++) {
          drivers.push({ name: driverName, phone: booking.phone, source: 'booking' });
        }
      }
      onAddToQueue(drivers, booking.consecutive);
    }
    await updateBookingStatus(booking.id, 'queued');
  }

  async function saveSettings(settings) {
    await apiFetch('/api/booking-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
    }, trackSlug);
    setShowSettingsModal(false);
    load();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const pendingCount = bookings.filter((b) => b.status === 'pending').length;

  return (
    <div className="dp-root">
      <div className="dp-topbar">
        <div className="dp-tabs">
          <button className={`dp-tab${activeTab === 'planner' ? ' active' : ''}`} onClick={() => setActiveTab('planner')}>
            📅 {he ? 'לוח יום' : 'Day Planner'}
          </button>
          <button className={`dp-tab${activeTab === 'bookings' ? ' active' : ''}`} onClick={() => setActiveTab('bookings')}>
            📋 {he ? 'הזמנות' : 'Bookings'}
            {pendingCount > 0 && <span className="dp-badge">{pendingCount}</span>}
          </button>
          <button className={`dp-tab${activeTab === 'settings' ? ' active' : ''}`} onClick={() => setActiveTab('settings')}>
            ⚙️ {he ? 'הגדרות' : 'Settings'}
          </button>
        </div>
      </div>

      {/* ── PLANNER TAB ── */}
      {activeTab === 'planner' && (
        <div className="dp-planner">
          <div className="dp-date-bar">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="dp-date-input" />
            <button className="dp-btn-today" onClick={() => setDate(todayStr())}>{he ? 'היום' : 'Today'}</button>
            <button className="dp-btn-add" onClick={() => { setEditingEvent(null); setShowEventModal(true); }}>
              + {he ? 'אירוע' : 'Event'}
            </button>
          </div>

          <div className="dp-timeline-wrap">
            {/* Hour labels */}
            <div className="dp-hour-labels">
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => {
                const h = HOUR_START + i;
                return (
                  <div key={h} className="dp-hour-label" style={{ top: minuteToY(i * 60) }}>
                    {String(h).padStart(2, '0')}:00
                  </div>
                );
              })}
            </div>

            {/* Grid lines */}
            <div className="dp-grid" style={{ height: TIMELINE_H }}>
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                <div key={i} className="dp-grid-line" style={{ top: minuteToY(i * 60) }} />
              ))}

              {/* Events */}
              {events.map((ev) => (
                <EventBlock key={ev.id} ev={ev} onClick={(e) => { setEditingEvent(e); setShowEventModal(true); }} />
              ))}

              {events.length === 0 && !loading && (
                <div className="dp-empty-timeline">
                  <p>{he ? 'אין אירועים לתאריך זה' : 'No events for this date'}</p>
                  <button className="dp-btn-add-inline" onClick={() => { setEditingEvent(null); setShowEventModal(true); }}>
                    + {he ? 'הוסף אירוע' : 'Add event'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BOOKINGS TAB ── */}
      {activeTab === 'bookings' && (
        <div className="dp-bookings">
          <div className="dp-bookings-header">
            <span className="dp-bookings-count">{bookings.length} {he ? 'הזמנות' : 'bookings'}</span>
            <button className="dp-btn-add" onClick={() => { setEditingBooking(null); setShowBookingModal(true); }}>
              + {he ? 'הזמנה ידנית' : 'Manual booking'}
            </button>
          </div>

          {bookings.length === 0 ? (
            <div className="dp-empty">{he ? 'אין הזמנות' : 'No bookings yet'}</div>
          ) : (
            <div className="dp-booking-list">
              {[...bookings].reverse().map((b) => (
                <div key={b.id} className={`dp-booking-card dp-booking-${b.status}`}>
                  <div className="dp-booking-top">
                    <strong className="dp-booking-name">{b.name}</strong>
                    <span className="dp-booking-status-badge" style={{ background: statusColor(b.status) + '22', color: statusColor(b.status) }}>
                      {BOOKING_STATUSES.find((s) => s.id === b.status)?.[he ? 'labelHe' : 'labelEn'] || b.status}
                    </span>
                  </div>
                  <div className="dp-booking-meta">
                    {b.phone && <span>📞 {b.phone}</span>}
                    <span>👥 {b.groupSize} × {b.heatsPerPerson} {he ? 'מקצים' : 'heats'}</span>
                    {b.consecutive && <span>⚡ {he ? 'ברצף' : 'Consecutive'}</span>}
                    {b.preferredSlot && <span>🕐 {SLOT_LABELS[b.preferredSlot]?.[he ? 'he' : 'en']}</span>}
                    <span className="dp-booking-source">{b.source}</span>
                  </div>
                  {b.note && <p className="dp-booking-note">{b.note}</p>}
                  <div className="dp-booking-actions">
                    {b.status === 'pending' && (
                      <>
                        <button className="dp-action-btn dp-action-confirm" onClick={() => updateBookingStatus(b.id, 'confirmed')}>
                          ✓ {he ? 'אשר' : 'Confirm'}
                        </button>
                        <button className="dp-action-btn dp-action-queue" onClick={() => sendToQueue(b)}>
                          ➕ {he ? 'לתור' : 'Queue'}
                        </button>
                      </>
                    )}
                    {b.status === 'confirmed' && (
                      <button className="dp-action-btn dp-action-queue" onClick={() => sendToQueue(b)}>
                        ➕ {he ? 'לתור' : 'Queue'}
                      </button>
                    )}
                    {b.status !== 'cancelled' && b.status !== 'done' && (
                      <button className="dp-action-btn dp-action-cancel" onClick={() => updateBookingStatus(b.id, 'cancelled')}>
                        ✕ {he ? 'בטל' : 'Cancel'}
                      </button>
                    )}
                    <button className="dp-action-btn dp-action-delete" onClick={() => deleteBooking(b.id)}>
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {activeTab === 'settings' && bookingSettings && (
        <BookingSettingsPanel settings={bookingSettings} onSave={saveSettings} trackSlug={trackSlug} he={he} />
      )}

      {/* ── EVENT MODAL ── */}
      {showEventModal && (
        <EventModal
          event={editingEvent}
          date={date}
          he={he}
          onSave={saveEvent}
          onDelete={editingEvent ? () => deleteEvent(editingEvent.id) : null}
          onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
        />
      )}

      {/* ── MANUAL BOOKING MODAL ── */}
      {showBookingModal && (
        <ManualBookingModal
          he={he}
          settings={bookingSettings}
          trackSlug={trackSlug}
          onClose={() => { setShowBookingModal(false); setEditingBooking(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── Event Modal ──────────────────────────────────────────────────────────────

function EventModal({ event, date, he, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(event?.title || '');
  const [type, setType] = useState(event?.type || 'booking');
  const [startTime, setStartTime] = useState(event?.startTime || '10:00');
  const [endTime, setEndTime] = useState(event?.endTime || '11:00');
  const [kartsReserved, setKartsReserved] = useState(event?.kartsReserved || 0);
  const [note, setNote] = useState(event?.note || '');

  function submit() {
    if (!title.trim()) return;
    onSave({ title: title.trim(), type, startTime, endTime, kartsReserved: Number(kartsReserved), note });
  }

  return (
    <div className="dp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dp-modal">
        <div className="dp-modal-header">
          <h3>{event ? (he ? 'עריכת אירוע' : 'Edit Event') : (he ? 'אירוע חדש' : 'New Event')}</h3>
          <button className="dp-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="dp-modal-body">
          <div className="dp-mf">
            <label>{he ? 'כותרת *' : 'Title *'}</label>
            <input type="text" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} className="dp-input" autoFocus />
          </div>

          <div className="dp-mf">
            <label>{he ? 'סוג אירוע' : 'Event type'}</label>
            <div className="dp-type-chips">
              {EVENT_TYPES.map((t) => (
                <button key={t.id} type="button"
                  className={`dp-type-chip${type === t.id ? ' active' : ''}`}
                  style={type === t.id ? { background: t.color + '33', borderColor: t.color, color: t.color } : {}}
                  onClick={() => setType(t.id)}
                >
                  {he ? t.labelHe : t.labelEn}
                </button>
              ))}
            </div>
          </div>

          <div className="dp-mf-row">
            <div className="dp-mf">
              <label>{he ? 'שעת התחלה' : 'Start'}</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="dp-input" />
            </div>
            <div className="dp-mf">
              <label>{he ? 'שעת סיום' : 'End'}</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="dp-input" />
            </div>
          </div>

          <div className="dp-mf">
            <label>{he ? 'קארטים שמורים' : 'Karts reserved'}</label>
            <input type="number" value={kartsReserved} onChange={(e) => setKartsReserved(e.target.value)} className="dp-input" min="0" />
          </div>

          <div className="dp-mf">
            <label>{he ? 'הערה' : 'Note'}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className="dp-input dp-textarea" rows={2} dir="auto" />
          </div>
        </div>

        <div className="dp-modal-footer">
          {onDelete && (
            <button className="dp-btn-delete" onClick={() => { if (window.confirm(he ? 'למחוק?' : 'Delete?')) onDelete(); }}>
              {he ? 'מחק' : 'Delete'}
            </button>
          )}
          <button className="dp-btn-ghost" onClick={onClose}>{he ? 'ביטול' : 'Cancel'}</button>
          <button className="dp-btn-primary" onClick={submit} disabled={!title.trim()}>
            {he ? 'שמור' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manual Booking Modal ──────────────────────────────────────────────────────

function ManualBookingModal({ he, settings, trackSlug, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [groupSize, setGroupSize] = useState(1);
  const [heatsPerPerson, setHeatsPerPerson] = useState(1);
  const [consecutive, setConsecutive] = useState(false);
  const [preferredSlot, setPreferredSlot] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const maxHeats = settings?.maxHeatsPerPerson || 3;

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone, groupSize, heatsPerPerson, consecutive, preferredSlot, note, source: 'admin' }),
      }, trackSlug);
      onSaved();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="dp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dp-modal">
        <div className="dp-modal-header">
          <h3>{he ? 'הזמנה ידנית' : 'Manual Booking'}</h3>
          <button className="dp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="dp-modal-body">
          <div className="dp-mf"><label>{he ? 'שם *' : 'Name *'}</label>
            <input type="text" dir="auto" value={name} onChange={(e) => setName(e.target.value)} className="dp-input" autoFocus /></div>
          <div className="dp-mf"><label>{he ? 'טלפון' : 'Phone'}</label>
            <input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className="dp-input" /></div>
          <div className="dp-mf-row">
            <div className="dp-mf"><label>{he ? 'אנשים' : 'Group'}</label>
              <input type="number" value={groupSize} onChange={(e) => setGroupSize(Math.max(1, Number(e.target.value)))} className="dp-input" min="1" /></div>
            <div className="dp-mf"><label>{he ? `מקצים (מקס׳ ${maxHeats})` : `Heats (max ${maxHeats})`}</label>
              <input type="number" value={heatsPerPerson} onChange={(e) => setHeatsPerPerson(Math.min(maxHeats, Math.max(1, Number(e.target.value))))} className="dp-input" min="1" max={maxHeats} /></div>
          </div>
          {groupSize === 1 && heatsPerPerson > 1 && settings?.allowConsecutive && (
            <div className="dp-mf">
              <label className="dp-check-label">
                <input type="checkbox" checked={consecutive} onChange={(e) => setConsecutive(e.target.checked)} />
                {he ? 'ברצף (לא יורד מהקארט)' : 'Consecutive (stay in kart)'}
              </label>
            </div>
          )}
          <div className="dp-mf"><label>{he ? 'מועדף' : 'Preferred slot'}</label>
            <select value={preferredSlot || ''} onChange={(e) => setPreferredSlot(e.target.value || null)} className="dp-input">
              <option value="">{he ? 'אין העדפה' : 'No preference'}</option>
              <option value="morning">{he ? 'בוקר' : 'Morning'}</option>
              <option value="afternoon">{he ? 'אחה"צ' : 'Afternoon'}</option>
              <option value="evening">{he ? 'ערב' : 'Evening'}</option>
            </select></div>
          <div className="dp-mf"><label>{he ? 'הערה' : 'Note'}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className="dp-input dp-textarea" rows={2} dir="auto" /></div>
        </div>
        <div className="dp-modal-footer">
          <button className="dp-btn-ghost" onClick={onClose}>{he ? 'ביטול' : 'Cancel'}</button>
          <button className="dp-btn-primary" onClick={submit} disabled={!name.trim() || saving}>
            {saving ? '...' : (he ? 'שמור הזמנה' : 'Save Booking')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Booking Settings Panel ────────────────────────────────────────────────────

function BookingSettingsPanel({ settings, onSave, trackSlug, he }) {
  const [enabled, setEnabled] = useState(settings.enabled || false);
  const [maxHeats, setMaxHeats] = useState(settings.maxHeatsPerPerson || 3);
  const [allowConsecutive, setAllowConsecutive] = useState(settings.allowConsecutive !== false);
  const [requirePhone, setRequirePhone] = useState(settings.requirePhone || false);
  const [kioskEnabled, setKioskEnabled] = useState(settings.kioskBookingEnabled || false);
  const [websiteEmbed, setWebsiteEmbed] = useState(settings.websiteEmbedEnabled || false);
  const [liveEmbed, setLiveEmbed] = useState(settings.liveTimingEmbedEnabled !== false);
  const [fleetSize, setFleetSize] = useState(settings.fleetSize || 12);
  const [markers, setMarkers] = useState(settings.calendarMarkers || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(settings.enabled || false);
    setMaxHeats(settings.maxHeatsPerPerson || 3);
    setAllowConsecutive(settings.allowConsecutive !== false);
    setRequirePhone(settings.requirePhone || false);
    setKioskEnabled(settings.kioskBookingEnabled || false);
    setWebsiteEmbed(settings.websiteEmbedEnabled || false);
    setLiveEmbed(settings.liveTimingEmbedEnabled !== false);
    setFleetSize(settings.fleetSize || 12);
    setMarkers(settings.calendarMarkers || []);
  }, [settings]);

  function addMarker() {
    setMarkers((list) => [...list, {
      date: new Date().toISOString().slice(0, 10),
      labelHe: '',
      labelEn: '',
      level: 'busy',
      messageHe: '',
      messageEn: '',
    }]);
  }

  function updateMarker(index, patch) {
    setMarkers((list) => list.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function removeMarker(index) {
    setMarkers((list) => list.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    await onSave({
      enabled,
      maxHeatsPerPerson: maxHeats,
      allowConsecutive,
      requirePhone,
      kioskBookingEnabled: kioskEnabled,
      websiteEmbedEnabled: websiteEmbed,
      liveTimingEmbedEnabled: liveEmbed,
      fleetSize: Math.max(1, Number(fleetSize) || 12),
      calendarMarkers: markers.filter((m) => m.date && (m.labelHe || m.labelEn)),
    });
    setSaving(false);
  }

  const kioskUrl = `${window.location.origin}/booking/${trackSlug}`;
  const embedBookingUrl = `${window.location.origin}/embed/booking/${trackSlug}`;

  return (
    <div className="dp-settings">
      <h3 className="dp-settings-title">{he ? 'הגדרות הזמנות' : 'Booking Settings'}</h3>

      <label className="dp-check-label dp-setting-row">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <div>
          <strong>{he ? 'מערכת הזמנות פעילה' : 'Booking system enabled'}</strong>
          <small>{he ? 'לקוחות יכולים להגיש הזמנות' : 'Customers can submit bookings'}</small>
        </div>
      </label>

      <label className="dp-check-label dp-setting-row">
        <input type="checkbox" checked={kioskEnabled} onChange={(e) => setKioskEnabled(e.target.checked)} />
        <div>
          <strong>{he ? 'דף הזמנה לקיוסק' : 'Kiosk booking page'}</strong>
          <small className="dp-kiosk-url">{kioskUrl}</small>
        </div>
      </label>

      <label className="dp-check-label dp-setting-row">
        <input type="checkbox" checked={websiteEmbed} onChange={(e) => setWebsiteEmbed(e.target.checked)} />
        <div>
          <strong>{he ? 'הטמעה באתר המסלול' : 'Embed on track website'}</strong>
          <small className="dp-kiosk-url">{embedBookingUrl}</small>
        </div>
      </label>

      <label className="dp-check-label dp-setting-row">
        <input type="checkbox" checked={liveEmbed} onChange={(e) => setLiveEmbed(e.target.checked)} />
        <div>
          <strong>{he ? 'Live Timing — iframe לאתר' : 'Live timing website iframe'}</strong>
          <small>{he ? 'מסך תוצאות בזמן אמת בדף הבית של המסלול' : 'Real-time results on track homepage'}</small>
        </div>
      </label>

      <div className="dp-setting-row">
        <label>{he ? 'גודל צי (קיבולת יומית)' : 'Fleet size (daily capacity)'}</label>
        <input type="number" value={fleetSize} onChange={(e) => setFleetSize(Math.max(1, Number(e.target.value)))} className="dp-input dp-input-sm" min="1" max="80" />
        <small>{he ? 'משמש לחישוב "מה פנוי" בלוח האינטרנט' : 'Powers the public availability calendar'}</small>
      </div>

      <div className="dp-setting-row">
        <label>{he ? 'מקס׳ מקצים לאדם' : 'Max heats per person'}</label>
        <input type="number" value={maxHeats} onChange={(e) => setMaxHeats(Math.max(1, Number(e.target.value)))} className="dp-input dp-input-sm" min="1" max="20" />
      </div>

      <label className="dp-check-label dp-setting-row">
        <input type="checkbox" checked={allowConsecutive} onChange={(e) => setAllowConsecutive(e.target.checked)} />
        <div>
          <strong>{he ? 'אפשר מקצים ברצף' : 'Allow consecutive heats'}</strong>
          <small>{he ? 'לקוח יכול לבקש לא לרדת מהקארט' : 'Customer can request staying in kart'}</small>
        </div>
      </label>

      <label className="dp-check-label dp-setting-row">
        <input type="checkbox" checked={requirePhone} onChange={(e) => setRequirePhone(e.target.checked)} />
        <div>
          <strong>{he ? 'טלפון חובה' : 'Phone required'}</strong>
        </div>
      </label>

      <div className="dp-setting-row">
        <div className="dp-settings-subhead">
          <strong>{he ? 'ימים מיוחדים (חג / עומס)' : 'Special days (holiday / busy)'}</strong>
          <button type="button" className="dp-btn-ghost dp-btn-sm" onClick={addMarker}>+ {he ? 'יום' : 'Day'}</button>
        </div>
        <div className="emb-markers-list">
          {markers.map((m, i) => (
            <div key={`${m.date}-${i}`} className="emb-marker-row">
              <input type="date" value={m.date} onChange={(e) => updateMarker(i, { date: e.target.value })} className="dp-input dp-input-sm" />
              <input type="text" placeholder={he ? 'תווית (עברית)' : 'Label'} value={m.labelHe} onChange={(e) => updateMarker(i, { labelHe: e.target.value })} className="dp-input dp-input-sm" dir="auto" />
              <select value={m.level || 'busy'} onChange={(e) => updateMarker(i, { level: e.target.value })} className="dp-input dp-input-sm">
                <option value="busy">{he ? 'עמוס' : 'Busy'}</option>
                <option value="closed">{he ? 'סגור' : 'Closed'}</option>
              </select>
              <button type="button" className="dp-btn-delete dp-btn-sm" onClick={() => removeMarker(i)}>✕</button>
            </div>
          ))}
        </div>
        <small>{he ? 'מוצג באזהרה בלוח ההזמנות באתר — מונע מבוכה מול לקוחות' : 'Shown on web booking calendar — avoids overbooking surprises'}</small>
      </div>

      <button className="dp-btn-primary dp-save-btn" onClick={save} disabled={saving}>
        {saving ? (he ? 'שומר...' : 'Saving...') : (he ? 'שמור הגדרות' : 'Save Settings')}
      </button>

      {(websiteEmbed || liveEmbed) && <TrackEmbedGuide trackSlug={trackSlug} compact />}
    </div>
  );
}
