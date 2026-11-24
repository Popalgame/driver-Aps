import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeByDriver, shiftsToCsv } from '../site/src/report.js';

const H = 3600e3;
const users = [
  { id: 'a', name: 'Андрій', role: 'driver' },
  { id: 'b', name: 'Богдан', role: 'driver' },
  { id: 'c', name: 'Віра', role: 'driver' },
  { id: 'm', name: 'Керівник', role: 'manager' },
];
const shifts = [
  { uid: 'a', start: 1 * H, end: 9 * H, breaks: [{ start: 4 * H, end: 5 * H }], note: '' },
  { uid: 'b', start: 2 * H, end: 4 * H, breaks: [], note: '' },
  { uid: 'b', start: 10 * H, end: null, breaks: [{ start: 11 * H, end: null }], note: '' },
  { uid: 'x', driverName: 'Видалений', start: 3 * H, end: 4 * H, breaks: [], note: '' },
];

test('підсумок по водіях: активні першими, далі за часом; керівник не в списку', () => {
  const rows = summarizeByDriver(shifts, users, 0, 24 * H, 12 * H);
  assert.deepEqual(rows.map((r) => r.uid), ['b', 'a', 'x', 'c']);
  const b = rows[0];
  assert.equal(b.total, 2 * H + 1 * H); // 2 год завершеної + 1 год активної до перерви
  assert.equal(b.count, 2);
  assert.ok(b.active && b.onBreak);
  assert.equal(rows[1].total, 7 * H);
  assert.equal(rows[2].name, 'Видалений');
  assert.equal(rows[3].total, 0);
});

test('зміни поза періодом не рахуються', () => {
  const rows = summarizeByDriver(shifts.slice(0, 2), users, 5 * H, 6 * H, 12 * H);
  const a = rows.find((r) => r.uid === 'a');
  assert.equal(a.total, 1 * H);
  assert.equal(rows.find((r) => r.uid === 'b').count, 0);
});

test('CSV: лише завершені зміни, з іменем водія', () => {
  const csv = shiftsToCsv(shifts, new Map([['a', 'Андрій'], ['b', 'Богдан']]));
  const lines = csv.replace('﻿', '').split('\r\n');
  assert.equal(lines.length, 1 + 3);
  assert.match(lines[0], /^"Водій";"Дата"/);
  assert.match(lines[1], /^"Андрій";/);
  assert.match(lines[1], /"7,00";""$/);
});
