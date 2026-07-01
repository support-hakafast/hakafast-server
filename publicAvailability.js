const SLOT_WINDOWS = {
  morning: { start: 8 * 60, end: 12 * 60, labelHe: 'בוקר', labelEn: 'Morning' },
  afternoon: { start: 12 * 60, end: 17 * 60, labelHe: 'אחה"צ', labelEn: 'Afternoon' },
  evening: { start: 17 * 60, end: 22 * 60, labelHe: 'ערב', labelEn: 'Evening' },
};

function parseMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateRange(fromDate, toDate) {
  const out = [];
  let cur = fromDate;
  const limit = 62;
  let n = 0;
  while (cur <= toDate && n < limit) {
    out.push(cur);
    cur = addDays(cur, 1);
    n += 1;
  }
  return out;
}

function getCalendarMarker(settings, date) {
  const markers = settings?.calendarMarkers || [];
  return markers.find((m) => m.date === date) || null;
}

function slotOverlap(startMin, endMin, slotId) {
  const win = SLOT_WINDOWS[slotId];
  if (!win) return false;
  return endMin > win.start && startMin < win.end;
}

function kartsReservedInSlot(events, slotId, date) {
  return (events || [])
    .filter((e) => e.date === date && e.type !== 'maintenance')
    .reduce((sum, e) => {
      const start = parseMinutes(e.startTime);
      const end = parseMinutes(e.endTime);
      if (!slotOverlap(start, end, slotId)) return sum;
      return sum + (Number(e.kartsReserved) || 0);
    }, 0);
}

function heatsCommittedInSlot(bookings, slotId, date) {
  return (bookings || [])
    .filter((b) => b.status !== 'cancelled' && b.preferredDate === date)
    .filter((b) => !b.preferredSlot || b.preferredSlot === slotId)
    .reduce((sum, b) => sum + (Number(b.groupSize) || 1) * (Number(b.heatsPerPerson) || 1), 0);
}

function computeSlotStatus(fleetSize, load) {
  const available = Math.max(0, fleetSize - load);
  if (available <= 0) return 'full';
  if (available <= Math.ceil(fleetSize * 0.25)) return 'limited';
  return 'open';
}

function computeDayAvailability({ date, settings, events, bookings }) {
  const fleetSize = Math.max(1, Number(settings?.fleetSize) || 12);
  const dayEvents = (events || []).filter((e) => e.date === date);
  const marker = getCalendarMarker(settings, date);

  const fullDayMaintenance = dayEvents.some((e) => {
    if (e.type !== 'maintenance') return false;
    const start = parseMinutes(e.startTime);
    const end = parseMinutes(e.endTime);
    return start <= SLOT_WINDOWS.morning.start && end >= SLOT_WINDOWS.evening.end;
  });

  const slots = Object.keys(SLOT_WINDOWS).map((id) => {
    const load = kartsReservedInSlot(dayEvents, id, date) + heatsCommittedInSlot(bookings, id, date);
    let status = computeSlotStatus(fleetSize, load);
    const slotMaint = dayEvents.some((e) => {
      if (e.type !== 'maintenance') return false;
      return slotOverlap(parseMinutes(e.startTime), parseMinutes(e.endTime), id);
    });
    if (fullDayMaintenance || slotMaint) status = 'closed';
    if (marker?.level === 'closed') status = 'closed';
    return {
      id,
      labelHe: SLOT_WINDOWS[id].labelHe,
      labelEn: SLOT_WINDOWS[id].labelEn,
      startTime: formatTime(SLOT_WINDOWS[id].start),
      endTime: formatTime(SLOT_WINDOWS[id].end),
      fleetSize,
      load,
      available: Math.max(0, fleetSize - load),
      status,
    };
  });

  let dayStatus = 'open';
  if (fullDayMaintenance || marker?.level === 'closed') dayStatus = 'closed';
  else if (marker?.level === 'busy') dayStatus = 'busy';
  else if (slots.every((s) => s.status === 'full' || s.status === 'closed')) dayStatus = 'full';
  else if (slots.some((s) => s.status === 'limited' || s.status === 'full')) dayStatus = 'limited';

  return {
    date,
    dayStatus,
    marker: marker || null,
    slots,
    messageHe: marker?.messageHe || marker?.labelHe || null,
    messageEn: marker?.messageEn || marker?.labelEn || null,
  };
}

function computeAvailabilityRange({ fromDate, toDate, settings, events, bookings }) {
  return dateRange(fromDate, toDate).map((date) => computeDayAvailability({
    date,
    settings,
    events,
    bookings,
  }));
}

function validatePublicBooking({ settings, events, bookings, data }) {
  if (!settings?.enabled) return { ok: false, error: 'bookings_disabled' };
  const preferredDate = data?.preferredDate;
  if (!preferredDate || !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
    return { ok: false, error: 'date_required' };
  }
  const day = computeDayAvailability({ date: preferredDate, settings, events, bookings });
  if (day.dayStatus === 'closed') return { ok: false, error: 'day_closed', day };
  const groupSize = Math.max(1, Number(data.groupSize) || 1);
  const heatsPerPerson = Math.max(1, Number(data.heatsPerPerson) || 1);
  const maxHeats = Math.max(1, Number(settings.maxHeatsPerPerson) || 3);
  if (heatsPerPerson > maxHeats) return { ok: false, error: 'max_heats_exceeded', day };
  const totalHeats = groupSize * heatsPerPerson;
  const slot = data.preferredSlot || null;
  if (slot) {
    const slotInfo = day.slots.find((s) => s.id === slot);
    if (!slotInfo || slotInfo.status === 'full' || slotInfo.status === 'closed') {
      return { ok: false, error: 'slot_unavailable', day };
    }
    if (totalHeats > slotInfo.available) {
      return { ok: false, error: 'capacity_exceeded', day, available: slotInfo.available };
    }
  } else if (day.dayStatus === 'full') {
    return { ok: false, error: 'day_full', day };
  }
  return { ok: true, day };
}

module.exports = {
  SLOT_WINDOWS,
  computeDayAvailability,
  computeAvailabilityRange,
  validatePublicBooking,
  dateRange,
  addDays,
};
