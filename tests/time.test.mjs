import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakMs, workMs, workInRange, totalSince, clock, hm, startOfWeek } from '../site/src/time.js';

const H = 3600e3, M = 60e3;

test('робочий час = зміна мінус перерви', () => {
  const s = { start: 0, end: 8 * H, breaks: [{ start: 2 * H, end: 2 * H + 30 * M }] };
  assert.equal(breakMs(s), 30 * M);
  assert.equal(workMs(s), 7 * H + 30 * M);
});

test('активна зміна й відкрита перерва рахуються до "зараз"', () => {
  const s = { start: 0, end: null, breaks: [{ start: 1 * H, end: null }] };
  assert.equal(workMs(s, 3 * H), 1 * H);
});

test('нічна зміна ділиться між днями', () => {
  const s = { start: 22 * H, end: 30 * H, breaks: [{ start: 23 * H, end: 25 * H }] };
  assert.equal(workInRange(s, 0, 24 * H), 1 * H);       // 22–24 мінус перерва 23–24
  assert.equal(workInRange(s, 24 * H, 48 * H), 5 * H);  // 0–6 мінус перерва 0–1
});

test('підсумок з певного моменту', () => {
  const shifts = [
    { start: 0, end: 2 * H, breaks: [] },
    { start: 10 * H, end: null, breaks: [] },
  ];
  assert.equal(totalSince(shifts, 1 * H, 12 * H), 1 * H + 2 * H);
});

test('форматування часу', () => {
  assert.equal(clock(3 * H + 4 * M + 5000), '03:04:05');
  assert.equal(hm(7 * H + 40 * M), '7 год 40 хв');
  assert.equal(hm(0), '0 год 00 хв');
});

test('тиждень починається з понеділка', () => {
  const d = startOfWeek(new Date(2026, 10, 26, 15)); // четвер, 26.11.2026
  assert.equal(d.getDay(), 1);
  assert.equal(d.getDate(), 23);
});
