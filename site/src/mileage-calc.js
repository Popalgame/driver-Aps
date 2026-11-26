// Кілометраж і заправки — чиста логіка без DOM (tests/mileage.test.mjs).
//
// Запис: { id, type: 'odo' | 'fuel', at (мс), km|null, liters|null, amount|null, note, car?, plate? }
//   odo  — показник одометра зранку; at = північ цього дня (один запис на день);
//          car / plate — на якій машині водій їде цього дня
//   fuel — заправка; at = момент заправки
import { startOfDay } from './time.js';

const sortAt = (a, b) => a.at - b.at;

// Кожен показник одометра належить машині (car — id машини, plate — номер). Пробіг рахується
// окремо для кожної машини: показник машини A з показником машини B не порівнюється.
// Старі записи без машини — «машина водія» (як було раніше).
export const odoGroup = (e) => (e.car ? 'c:' + e.car : 'u:' + (e.uid || ''));

// Показники одометра по днях (у порядку дат).
//   diff   — від попереднього запису тієї самої машини
//   driven — пробіг за цей день: наступний показник тієї самої машини мінус цей
//            (null, поки наступного немає; наступний може вписати й інший водій)
//   span   — скільки днів охоплює driven (1 — звичайно; більше, якщо дні пропущено)
export function odoRows(entries) {
  const odo = entries.filter((e) => e.type === 'odo' && typeof e.km === 'number').sort(sortAt);
  const groups = new Map();
  for (const e of odo) {
    const k = odoGroup(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const rows = new Map();
  for (const list of groups.values()) {
    list.forEach((e, i) => {
      const next = list[i + 1];
      rows.set(e, {
        ...e,
        diff: i ? e.km - list[i - 1].km : null,
        driven: next ? next.km - e.km : null,
        span: next ? Math.max(1, Math.round((next.at - e.at) / 86400000)) : null,
      });
    });
  }
  return odo.map((e) => rows.get(e));
}

// Пробіг кожного водія по днях: Map(uid → Map(dayStart → км)); пробіг дня D = ранок(D+1) − ранок(D)
// тієї самої машини. Якщо дні пропущено, пробіг записується на перший з них.
export function drivenByDay(entries) {
  const out = new Map();
  for (const r of odoRows(entries)) {
    if (!out.has(r.uid)) out.set(r.uid, new Map());
    if (r.driven != null) out.get(r.uid).set(r.at, (out.get(r.uid).get(r.at) || 0) + r.driven);
  }
  return out;
}

// Пробіг водія за період [from, to) з урахуванням машин: сума пробігів його показників у періоді.
// entries — записи всіх водіїв (щоб наступний показник машини міг бути від іншого водія).
export function kmForDriver(entries, uid, from, to) {
  return odoRows(entries).filter((r) => r.uid === uid && r.at >= from && r.at < to && r.driven != null)
    .reduce((a, r) => a + r.driven, 0);
}

// Пробіг за період [from, to): для кожної машини — від першого показника в періоді до першого
// показника після періоду (ранок наступного дня), а якщо його ще немає — до останнього в періоді
export function distanceIn(entries, from, to) {
  const groups = new Map();
  for (const e of entries) {
    if (e.type !== 'odo' || typeof e.km !== 'number') continue;
    const k = odoGroup(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  let total = 0;
  for (const list of groups.values()) {
    const odo = list.sort(sortAt);
    const first = odo.find((e) => e.at >= from && e.at < to);
    if (!first) continue;
    const after = odo.find((e) => e.at >= to);
    const inside = odo.filter((e) => e.at >= from && e.at < to);
    const last = after || inside[inside.length - 1];
    total += Math.max(0, last.km - first.km);
  }
  return total;
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

// Останній показник до дня dayStart (для підказки «учора» і перевірки).
// car — лише цієї машини (якщо її записів ще немає — останній старий запис без машини).
export function previousOdo(entries, dayStart, car) {
  const odo = entries.filter((e) => e.type === 'odo' && typeof e.km === 'number' && e.at < dayStart).sort(sortAt);
  if (car === undefined) return odo[odo.length - 1] || null;
  const same = odo.filter((e) => e.car === car);
  if (same.length) return same[same.length - 1];
  const legacy = odo.filter((e) => !e.car);
  return legacy[legacy.length - 1] || null;
}

// Яка машина в цього водія «звична»: учорашня (остання вписана) або закріплена керівником
export function defaultCar(entries, cars, uid) {
  const odo = entries.filter((e) => e.type === 'odo' && e.car).sort(sortAt);
  const last = odo[odo.length - 1]?.car;
  if (last && cars.some((c) => c.id === last)) return last;
  return cars.find((c) => c.driver === uid)?.id || (cars.length === 1 ? cars[0].id : null);
}

export const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// «+317 км за день» / «+580 км за 2 дні»
const nf = new Intl.NumberFormat('uk-UA');
export const drivenText = (r) => {
  if (r.driven == null) return '';
  const v = `${r.driven >= 0 ? '+' : '−'}${nf.format(Math.abs(r.driven))} км`;
  return r.span > 1 ? `${v} за ${r.span} ${r.span < 5 ? 'дні' : 'днів'}` : `${v} за день`;
};

// Чи вписано кілометраж за день (dayStart — північ). Питаємо один раз на календарний день:
// при першому «Почати роботу», поки за сьогодні показника немає.
export const hasOdoOn = (entries, dayStart) =>
  entries.some((e) => e.type === 'odo' && e.at === dayStart && typeof e.km === 'number');

// Свої записи + показники машин від інших водіїв (без дублів): для підрахунку пробігу
export const withCarKm = (own, carKm, uid) => [...own, ...carKm.filter((e) => e.uid !== uid && !own.some((o) => o.id === e.id))];
