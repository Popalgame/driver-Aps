import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recipientsFor, myUnread, readStats, toLabel, isLive } from '../site/src/notice-calc.js';
import { hasOdoOn } from '../site/src/mileage-calc.js';

const users = [
  { id: 'boss', role: 'manager' },
  { id: 'a', role: 'driver' },
  { id: 'b', role: 'driver' },
  { id: 'gone', role: 'disabled' },
  { id: 'new', role: 'pending' },
  { id: 'olha', role: 'hr', kind: 'hr' },
  { id: 'olhaOff', role: 'disabled', kind: 'hr' },
];
const projects = [{ id: 'p1', name: 'Струмет', members: ['a', 'gone'], hr: ['olha'] }];

test('отримувачі: усім, водіям, кадрам, проєкту, одній людині', () => {
  const r = (to, target, me = 'boss') => recipientsFor({ to, target, users, projects, me }).sort();
  assert.deepEqual(r('all'), ['a', 'b', 'olha']);
  assert.deepEqual(r('drivers'), ['a', 'b']);
  assert.deepEqual(r('hr'), ['olha']);
  assert.deepEqual(r('project', 'p1'), ['a', 'olha']); // закритий доступ — не отримує
  assert.deepEqual(r('project', 'p1', 'olha'), ['a']); // кадрова — не собі
  assert.deepEqual(r('user', 'b'), ['b']);
  assert.deepEqual(r('project', 'nope'), []);
});

test('кадрова без списку користувачів: учасники проєкту', () => {
  assert.deepEqual(recipientsFor({ to: 'project', target: 'p1', projects, me: 'olha' }).sort(), ['a', 'gone']);
});

test('мої непрочитані: важливі першими, прострочені сховано', () => {
  const now = 10000;
  const list = [
    { id: 'old', recipients: ['a'], read: {}, createdAt: 1, until: null },
    { id: 'imp', recipients: ['a'], read: {}, createdAt: 2, important: true, until: null },
    { id: 'new', recipients: ['a'], read: {}, createdAt: 3, until: null },
    { id: 'read', recipients: ['a'], read: { a: 5 }, createdAt: 4, until: null },
    { id: 'exp', recipients: ['a'], read: {}, createdAt: 5, until: 9000 },
    { id: 'other', recipients: ['b'], read: {}, createdAt: 6, until: null },
  ];
  assert.deepEqual(myUnread(list, 'a', now).map((n) => n.id), ['imp', 'new', 'old']);
  assert.equal(isLive({ until: 9000 }, now), false);
});

test('хто прочитав', () => {
  const s = readStats({ recipients: ['a', 'b'], names: { a: 'Андрій', b: 'Богдан' }, read: { a: 7 } });
  assert.deepEqual(s.read, [{ uid: 'a', name: 'Андрій', at: 7 }]);
  assert.deepEqual(s.unread, [{ uid: 'b', name: 'Богдан' }]);
  assert.equal(toLabel({ to: 'project', target: 'p1' }, projects), 'Проєкт «Струмет»');
  assert.equal(toLabel({ to: 'user', target: 'b', names: { b: 'Богдан' } }), 'Богдан');
});

test('кілометраж питаємо раз на календарний день', () => {
  const day = 1000;
  assert.equal(hasOdoOn([], day), false);
  assert.equal(hasOdoOn([{ type: 'fuel', at: day, km: 5 }], day), false);
  assert.equal(hasOdoOn([{ type: 'odo', at: day - 86400000, km: 5 }], day), false); // учорашній не рахується
  assert.equal(hasOdoOn([{ type: 'odo', at: day, km: 5 }], day), true);
});
