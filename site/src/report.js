// Звіти для керівника — чиста логіка без DOM (tests/report.test.mjs). Excel — у export.js.
import { breakMs, workMs, workInRange, startOfDay, startOfWeek, startOfMonth } from './time.js';

// Підсумок по водіях за період [from, to).
// Повертає [{ uid, name, email, role, total, count, active, onBreak, shifts }] —
// спершу ті, хто зараз на зміні, далі за робочим часом; із закритим доступом — у кінці.
// Користувачі, що чекають підтвердження ('pending'), і керівники до списку не входять
// (хіба що мають зміни за період).
export function summarizeByDriver(shifts, users, from, to, now = Date.now()) {
  const byUid = new Map();
  const row = (uid, name = '', email = '') => {
    if (!byUid.has(uid)) byUid.set(uid, { uid, name, email, role: '', total: 0, count: 0, active: null, onBreak: false, shifts: [] });
    return byUid.get(uid);
  };
  for (const u of users) if ((u.role === 'driver' || u.role === 'disabled') && u.kind !== 'hr') row(u.id ?? u.uid, u.name, u.email);
  for (const s of shifts) {
    const r = row(s.uid, s.driverName || '');
    const ms = workInRange(s, from, to, now);
    if (s.end == null) {
      r.active = s;
      r.onBreak = s.breaks.some((b) => b.end == null);
    }
    if (ms > 0 || s.end == null) {
      r.total += ms;
      r.count += 1;
      r.shifts.push(s);
    }
  }
  for (const u of users) {
    const r = byUid.get(u.id ?? u.uid);
    if (!r) continue;
    if (u.name) r.name = u.name;
    if (u.email) r.email = u.email;
    r.role = u.role || '';
  }
  const list = [...byUid.values()];
  for (const r of list) {
    r.name = r.name || 'Без імені';
    r.shifts.sort((a, b) => b.start - a.start);
  }
  const off = (r) => (r.role === 'disabled' ? 1 : 0);
  return list.sort((a, b) => (off(a) - off(b)) || (!!b.active - !!a.active) || (b.total - a.total) || a.name.localeCompare(b.name, 'uk'));
}

// ---------- Сторінка водія ----------
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const sum = (shifts, from, to, now) => shifts.reduce((a, s) => a + workInRange(s, +from, +to, now), 0);

// Підсумки одного водія: години за періоди, кількість змін, середня зміна, перерви
export function driverStats(shifts, now = Date.now()) {
  const day = startOfDay(new Date(now));
  const week = startOfWeek(new Date(now));
  const month = startOfMonth(new Date(now));
  const end = now + 1;
  const done = shifts.filter((s) => s.end != null);
  const inMonth = shifts.filter((s) => workInRange(s, +month, end, now) > 0 || (s.end == null && s.start >= +month));
  return {
    today: sum(shifts, day, end, now),
    week: sum(shifts, week, end, now),
    lastWeek: sum(shifts, addDays(week, -7), week, now),
    month: sum(shifts, month, end, now),
    lastMonth: sum(shifts, addMonths(month, -1), month, now),
    all: shifts.reduce((a, s) => a + workMs(s, now), 0),
    shiftsMonth: inMonth.length,
    shiftsAll: shifts.length,
    avgShift: done.length ? done.reduce((a, s) => a + workMs(s), 0) / done.length : 0,
    breaksMonth: inMonth.reduce((a, s) => a + breakMs(s, now), 0),
    firstShift: shifts.length ? Math.min(...shifts.map((s) => s.start)) : null,
  };
}

// Години по днях тижня (пн–нд), що починається з weekStart
export function weekByDay(shifts, weekStart, now = Date.now()) {
  return Array.from({ length: 7 }, (_, i) => {
    const from = addDays(weekStart, i), to = addDays(weekStart, i + 1);
    return { start: +from, ms: sum(shifts, from, to, now) };
  });
}
