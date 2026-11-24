import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeByDriver, shiftsToCsv } from '../site/src/report.js';

const H = 3600e3;
const users = [
  { id: 'a', name: 'Андрій', role: 'driver' },
  { id: 'b', name: 'Богдан', role: 'driver' },
  { id: 'c', name: 'Віра', role: 'driver' },
  { id: 'd', name: 'Звільнений', role: 'disabled' },
  { id: 'p', name: 'Новенький', role: 'pending' },
  { id: 'm', name: 'Керівник', role: 'manager' },
];
const shifts = [
  { uid: 'a', start: 1 * H, end: 9 * H, breaks: [{ start: 4 * H, end: 5 * H }], note: '' },
  { uid: 'b', start: 2 * H, end: 4 * H, breaks: [], note: '' },
  { uid: 'b', start: 10 * H, end: null, breaks: [{ start: 11 * H, end: null }], note: '' },
  { uid: 'x', driverName: 'Видалений', start: 3 * H, end: 4 * H, breaks: [], note: '' },
];

test('підсумок по водіях: активні першими, далі за часом; закриті в кінці; керівник і pending не в списку', () => {
  const rows = summarizeByDriver(shifts, users, 0, 24 * H, 12 * H);
  assert.deepEqual(rows.map((r) => r.uid), ['b', 'a', 'x', 'c', 'd']);
  assert.equal(rows[4].role, 'disabled');
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

import { driverStats, weekByDay } from '../site/src/report.js';

test('сторінка водія: підсумки за періоди', () => {
  // Середа, 25.11.2026, 12:00 місцевого часу
  const now = +new Date(2026, 10, 25, 12, 0);
  const at = (d, h) => +new Date(2026, 10, d, h, 0);
  const shifts = [
    { start: at(25, 8), end: null, breaks: [{ start: at(25, 10), end: at(25, 10) + 30 * 60e3 }], note: '' }, // сьогодні, активна: 3,5 год
    { start: at(24, 8), end: at(24, 16), breaks: [], note: '' },  // вівторок цього тижня: 8 год
    { start: at(18, 9), end: at(18, 15), breaks: [], note: '' },  // минулий тиждень: 6 год
    { start: +new Date(2026, 9, 30, 8), end: +new Date(2026, 9, 30, 13), breaks: [], note: '' }, // жовтень: 5 год
  ];
  const s = driverStats(shifts, now);
  assert.equal(s.today, 3.5 * H);
  assert.equal(s.week, 11.5 * H);
  assert.equal(s.lastWeek, 6 * H);
  assert.equal(s.month, 17.5 * H);
  assert.equal(s.lastMonth, 5 * H);
  assert.equal(s.all, 22.5 * H);
  assert.equal(s.shiftsMonth, 3);
  assert.equal(s.avgShift, (8 + 6 + 5) / 3 * H);
  assert.equal(s.breaksMonth, 30 * 60e3);

  const days = weekByDay(shifts, new Date(2026, 10, 23), now);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.ms / H), [0, 8, 3.5, 0, 0, 0, 0]);
});
