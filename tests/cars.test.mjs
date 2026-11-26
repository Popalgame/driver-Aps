import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastKm, carKm, driverCar } from '../site/src/car-calc.js';

test('останній кілометраж водія', () => {
  const e = [{ type: 'odo', uid: 'a', at: 1, km: 100 }, { type: 'odo', uid: 'a', at: 5, km: 180 }, { type: 'odo', uid: 'b', at: 9, km: 999 }, { type: 'fuel', uid: 'a', at: 9, km: 200 }];
  assert.deepEqual(lastKm(e, 'a'), { km: 180, at: 5 });
  assert.equal(lastKm(e, 'z'), null);
});

test('кілометраж машини: останній показник на ній від будь-якого водія', () => {
  const e = [
    { type: 'odo', uid: 'a', at: 1, km: 100 },                // старий, без машини
    { type: 'odo', uid: 'a', at: 2, km: 150, car: 'A' },
    { type: 'odo', uid: 'b', at: 3, km: 210, car: 'A' },
    { type: 'odo', uid: 'a', at: 4, km: 5000, car: 'B' },
  ];
  assert.deepEqual(carKm(e, { id: 'A', driver: 'a' }), { km: 210, at: 3, uid: 'b' });
  assert.equal(carKm(e, { id: 'B' }).km, 5000);
  assert.deepEqual(carKm(e, { id: 'C', driver: 'a' }), { km: 100, at: 1 }); // ще не вписували — старий запис водія
  assert.equal(carKm(e, { id: 'C' }), null);
});

test('машина водія: сьогоднішня, остання або закріплена', () => {
  const cars = [{ id: 'A', driver: 'a' }, { id: 'B' }];
  const now = +new Date(2026, 10, 26, 12);
  const today = +new Date(2026, 10, 26), yday = +new Date(2026, 10, 25);
  assert.deepEqual(driverCar(cars, [], 'a', now), { car: cars[0], how: 'assigned' });
  assert.equal(driverCar(cars, [], 'b', now), null);
  assert.equal(driverCar(cars, [{ type: 'odo', uid: 'a', at: yday, km: 1, car: 'B' }], 'a', now).how, 'last');
  const t = driverCar(cars, [{ type: 'odo', uid: 'a', at: yday, km: 1, car: 'A' }, { type: 'odo', uid: 'a', at: today, km: 2, car: 'B' }], 'a', now);
  assert.equal(t.car.id, 'B'); assert.equal(t.how, 'today');
});
