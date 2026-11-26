import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editedShift, checkShift } from '../site/src/shift-edit.js';

const H = 3600e3, now = 100 * H;
const boss = { uid: 'boss', name: 'Денис' };

test('забув «Закінчити»: керівник ставить кінець, відкрита перерва закривається', () => {
  const s = { id: 's1', uid: 'a', start: 80 * H, end: null, breaks: [{ start: 82 * H, end: null }], note: '' };
  const r = editedShift(s, { start: 80 * H, end: 89 * H, breakMin: Math.round((now - 82 * H) / 60000), note: '' }, boss, now);
  assert.equal(r.end, 89 * H);
  assert.deepEqual(r.breaks, [{ start: 82 * H, end: 89 * H }]);
  assert.equal(r.editedBy, 'boss'); assert.equal(r.editedByName, 'Денис'); assert.equal(r.editedAt, now);
  assert.equal(r.uid, 'a'); assert.equal(r.id, 's1');
});

test('перерви змінено — один блок у кінці; нова зміна', () => {
  const r = editedShift(null, { start: 10 * H, end: 18 * H, breakMin: 30, note: ' Забув натиснути ' }, boss, now);
  assert.deepEqual(r.breaks, [{ start: 18 * H - 30 * 60000, end: 18 * H }]);
  assert.equal(r.note, 'Забув натиснути');
});

test('перевірки', () => {
  assert.deepEqual(checkShift({ start: 10 * H, end: 9 * H }, [], now).err, ['Кінець має бути пізніше за початок.']);
  assert.ok(checkShift({ start: 10 * H, end: 101 * H }, [], now).err.length);
  assert.ok(checkShift({ start: 10 * H, end: 11 * H, breakMin: 90 }, [], now).err.length);
  assert.deepEqual(checkShift({ start: 10 * H, end: 30 * H }, [], now).warn, ['Зміна вийде 20 год.']);
  assert.equal(checkShift({ start: 10 * H, end: 12 * H }, [{ start: 11 * H, end: 13 * H }], now).warn.length, 1);
  assert.deepEqual(checkShift({ start: 10 * H, end: 12 * H }, [{ start: 12 * H, end: 13 * H }], now), { err: [], warn: [] });
});
