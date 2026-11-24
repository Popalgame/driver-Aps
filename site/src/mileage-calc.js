// Кілометраж і заправки — чиста логіка без DOM (tests/mileage.test.mjs).
//
// Запис: { id, type: 'odo' | 'fuel', at (мс), km|null, liters|null, amount|null, note }
//   odo  — показник одометра зранку; at = північ цього дня (один запис на день)
//   fuel — заправка; at = момент заправки
import { startOfDay } from './time.js';

const sortAt = (a, b) => a.at - b.at;

// Показники одометра по днях з «проїхано» відносно попереднього запису
export function odoRows(entries) {
  const odo = entries.filter((e) => e.type === 'odo' && typeof e.km === 'number').sort(sortAt);
  return odo.map((e, i) => ({ ...e, diff: i ? e.km - odo[i - 1].km : null }));
}

// Пробіг за період [from, to): від першого показника в періоді до першого показника
// після періоду (ранок наступного дня), а якщо його ще немає — до останнього в періоді
export function distanceIn(entries, from, to) {
  const odo = entries.filter((e) => e.type === 'odo' && typeof e.km === 'number').sort(sortAt);
  const first = odo.find((e) => e.at >= from && e.at < to);
  if (!first) return 0;
  const after = odo.find((e) => e.at >= to);
  const inside = odo.filter((e) => e.at >= from && e.at < to);
  const last = after || inside[inside.length - 1];
  return Math.max(0, last.km - first.km);
}

export function fuelIn(entries, from, to) {
  const f = entries.filter((e) => e.type === 'fuel' && e.at >= from && e.at < to);
  return {
    count: f.length,
    liters: f.reduce((a, e) => a + (e.liters || 0), 0),
    amount: f.reduce((a, e) => a + (e.amount || 0), 0),
  };
}

export function summary(entries, from, to) {
  const km = distanceIn(entries, from, to);
  const fuel = fuelIn(entries, from, to);
  return { km, ...fuel, per100: km > 0 && fuel.liters > 0 ? (fuel.liters / km) * 100 : null };
}

// Підсумки по календарних місяцях (від найстаршого запису)
export function byMonth(entries) {
  if (!entries.length) return [];
  const minAt = Math.min(...entries.map((e) => e.at));
  const maxAt = Math.max(...entries.map((e) => e.at));
  const out = [];
  const m = startOfDay(new Date(minAt)); m.setDate(1);
  while (+m <= maxAt) {
    const next = new Date(m); next.setMonth(next.getMonth() + 1);
    out.push({ from: +m, ...summary(entries, +m, +next) });
    m.setMonth(m.getMonth() + 1);
  }
  return out;
}

// Останній показник до дня dayStart (для підказки «учора» і перевірки)
export function previousOdo(entries, dayStart) {
  const odo = entries.filter((e) => e.type === 'odo' && typeof e.km === 'number' && e.at < dayStart).sort(sortAt);
  return odo[odo.length - 1] || null;
}

export const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
