import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastKm, carKm } from '../site/src/car-calc.js';

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
