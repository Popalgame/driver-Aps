import { test } from 'node:test';
import assert from 'node:assert/strict';
import { odoRows, distanceIn, fuelIn, summary, byMonth, previousOdo, dayKey, drivenByDay } from '../site/src/mileage-calc.js';

const day = (m, d) => +new Date(2026, m, d);
const odo = (m, d, km) => ({ type: 'odo', at: day(m, d), km, liters: null, amount: null, note: '' });
const fuel = (m, d, liters, amount) => ({ type: 'fuel', at: day(m, d) + 10 * 3600e3, km: null, liters, amount, note: '' });

const entries = [
  odo(9, 30, 99500),
  odo(10, 1, 100000), odo(10, 2, 100300), fuel(10, 2, 50, 300), odo(10, 4, 100900),
  fuel(10, 20, 40, 250), odo(10, 30, 102000),
  odo(11, 1, 102400),
];

test('проїхано між сусідніми показниками', () => {
  const rows = odoRows(entries);
  assert.deepEqual(rows.map((r) => r.diff), [null, 500, 300, 600, 1100, 400]);
  // пробіг за день — до наступного ранку; 2.11 → 4.11 пропущено 3.11
  assert.deepEqual(rows.map((r) => r.driven), [500, 300, 600, 1100, 400, null]);
  assert.deepEqual(rows.map((r) => r.span), [2, 1, 2, 26, 1, null]); // 30.10→1.11 = 2 дні
});

test('пробіг за день по водіях = пробіг місяця в сумі', () => {
  const a = entries.map((e) => ({ ...e, uid: 'a' }));
  const b = [odo(10, 1, 5000), odo(10, 2, 5100)].map((e) => ({ ...e, uid: 'b' }));
  const m = drivenByDay([...a, ...b]);
  assert.equal(m.get('b').get(day(10, 1)), 100);
  const nov = [...m.get('a')].filter(([d]) => d >= day(10, 1) && d < day(11, 1)).reduce((x, [, v]) => x + v, 0);
  assert.equal(nov, distanceIn(a, day(10, 1), day(11, 1)));
});

test('пробіг за місяць — до ранку 1-го числа наступного місяця', () => {
  assert.equal(distanceIn(entries, day(10, 1), day(11, 1)), 2400); // 100000 → 102400
  // поточний місяць без наступного показника — до останнього в місяці
  assert.equal(distanceIn(entries, day(11, 1), day(12, 1)), 0);
  assert.equal(distanceIn(entries.slice(0, 5), day(10, 1), day(11, 1)), 900);
});

test('заправки і витрата на 100 км', () => {
  assert.deepEqual(fuelIn(entries, day(10, 1), day(11, 1)), { count: 2, liters: 90, amount: 550 });
  assert.equal(summary(entries, day(10, 1), day(11, 1)).per100, 90 / 2400 * 100);
  assert.equal(summary([], 0, 1).per100, null);
});

test('по місяцях і попередній показник', () => {
  const months = byMonth(entries);
  assert.equal(months.length, 3);
  assert.equal(months[1].km, 2400);
  assert.equal(previousOdo(entries, day(10, 4)).km, 100300);
  assert.equal(previousOdo(entries, day(9, 1)), null);
  assert.equal(dayKey(day(10, 4)), '2026-11-04');
});

test('пробіг рахується окремо для кожної машини', async () => {
  const { kmForDriver, defaultCar } = await import('../site/src/mileage-calc.js');
  const r = (uid, d, km, car) => ({ uid, type: 'odo', at: day(10, d), km, car, note: '' });
  // Андрій: 1-го на A, 2-го на B, 3-го знову на A. Богдан 2-го взяв A.
  const all = [r('a', 1, 1000, 'A'), r('a', 2, 5000, 'B'), r('b', 2, 1100, 'A'), r('a', 3, 1250, 'A'), r('a', 4, 5200, 'B')];
  const rows = odoRows(all);
  const by = (uid, d) => rows.find((x) => x.uid === uid && x.at === day(10, d));
  assert.equal(by('a', 1).driven, 100);   // A: 1000 → 1100 (наступний показник A — від Богдана)
  assert.equal(by('a', 2).driven, 200);   // B: 5000 → 5200
  assert.equal(by('b', 2).driven, 150);   // A: 1100 → 1250
  assert.equal(by('a', 3).diff, 150);
  assert.equal(kmForDriver(all, 'a', day(10, 1), day(10, 5)), 300);
  assert.equal(kmForDriver(all, 'b', day(10, 1), day(10, 5)), 150);
  assert.equal(drivenByDay(all).get('a').get(day(10, 2)), 200);
  // Лише свої записи водія: пробіг кожної машини окремо, без змішування 1000 → 5000
  const mine = all.filter((e) => e.uid === 'a');
  assert.equal(odoRows(mine).find((x) => x.at === day(10, 2)).diff, null);
  assert.equal(distanceIn(mine, day(10, 1), day(10, 5)), 250 + 200);
  assert.equal(previousOdo(mine, day(10, 4), 'A').km, 1250);
  assert.equal(previousOdo(mine, day(10, 4), 'B').km, 5000);
  assert.equal(previousOdo([odo(10, 1, 77)], day(10, 4), 'B').km, 77); // старий запис без машини
  assert.equal(defaultCar(mine, [{ id: 'A' }, { id: 'B' }], 'a'), 'B');
  assert.equal(defaultCar([], [{ id: 'A', driver: 'a' }, { id: 'B' }], 'a'), 'A');
  // працівник: своя першою, якщо ще не їздив і машину фірми не закріпили
  assert.equal(defaultCar([], [{ id: 'own_a', personal: true }, { id: 'A' }, { id: 'B' }], 'a'), 'own_a');
  assert.equal(defaultCar([], [{ id: 'own_a', personal: true }, { id: 'A', driver: 'a' }], 'a'), 'A');
});
