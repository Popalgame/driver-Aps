import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItems, isUnread, trackJoins } from '../site/src/inbox-calc.js';

const now = +new Date(2026, 10, 24, 12, 0);
const projects = [{ id: 'p1', name: 'Струмет' }];
const ev = (id, extra) => ({ id, project: 'p1', date: '2026-12-10', time: '08:00', title: 'Медкомісія', people: 5, by: 'bob', byName: 'Боб', createdAt: now - 3600e3, updatedAt: now - 3600e3, ...extra });

test('нова подія від іншого — сповіщення; своя — ні', () => {
  const items = buildItems({ uid: 'me', role: 'driver', projects, events: [ev('a'), ev('b', { by: 'me' })], now, since: 0 });
  assert.deepEqual(items.map((i) => i.id), ['new-a']);
  assert.match(items[0].text, /Боб додав\(ла\) подію «Медкомісія»/);
  assert.match(items[0].sub, /Струмет/);
  assert.deepEqual(items[0].go, { tab: 'calendar', date: '2026-12-10', project: 'p1' });
});

test('зміна чужої події, нагадування «сьогодні / завтра», чужий проєкт ігнорується', () => {
  const items = buildItems({ uid: 'me', role: 'driver', projects, now, since: 0, events: [
    ev('e', { by: 'me', editedBy: 'bob', editedByName: 'Боб', updatedAt: now - 60e3 }),
    ev('t', { by: 'me', date: '2026-11-25', time: '' }),
    ev('x', { project: 'other' }),
  ] });
  assert.deepEqual(items.map((i) => i.id).sort(), ['edit-e-' + (now - 60e3), 'soon-t-2026-11-25'].sort());
  assert.equal(items.find((i) => i.id.startsWith('soon')).text, 'Завтра: Медкомісія');
});

test('старіші за «since» не показуються; прочитані', () => {
  assert.equal(buildItems({ uid: 'me', role: 'driver', projects, events: [ev('a')], now, since: now }).length, 0);
  const item = { id: 'x', at: 100 };
  assert.equal(isUnread(item, {}), true);
  assert.equal(isUnread(item, { readAll: 200 }), false);
  assert.equal(isUnread(item, { read: ['x'] }), false);
});

test('додали до проєкту: перший запуск — тихо, далі — сповіщення', () => {
  let seen = trackJoins({}, ['p1'], 1);
  assert.deepEqual(seen.joined, {});
  seen = trackJoins(seen, ['p1', 'p2'], 5);
  assert.deepEqual(seen.joined, { p2: 5 });
  const items = buildItems({ uid: 'me', role: 'driver', projects: [...projects, { id: 'p2', name: 'Млешна' }], joined: seen.joined, now: 10 });
  assert.equal(items[0].text, 'Тебе додали до проєкту «Млешна»');
  assert.deepEqual(trackJoins(seen, ['p1'], 9).joined, {}); // прибрали з проєкту
});

test('керівник: нові користувачі чекають підтвердження', () => {
  const items = buildItems({ uid: 'boss', role: 'manager', users: [{ id: 'n', name: 'Новий', email: 'n@x', role: 'pending', createdAt: now - 1000 }, { id: 'd', role: 'driver' }], now });
  assert.deepEqual(items.map((i) => i.id), ['pend-n']);
  assert.deepEqual(items[0].go, { tab: 'manager' });
});

test('оголошення в конвертику: непрочитане, доки не «Прочитав»', async () => {
  const { buildItems, isUnread } = await import('../site/src/inbox-calc.js');
  const notices = [
    { id: 'n1', text: 'Вписуйте кілометраж', byName: 'Шеф', recipients: ['a'], read: {}, createdAt: 1000, until: null },
    { id: 'n2', text: 'Прочитане', byName: 'Шеф', recipients: ['a'], read: { a: 5 }, createdAt: 900, until: null },
    { id: 'n3', text: 'Не мені', byName: 'Шеф', recipients: ['b'], read: {}, createdAt: 900, until: null },
  ];
  const items = buildItems({ uid: 'a', role: 'driver', notices, now: 2000 });
  assert.deepEqual(items.map((i) => i.id), ['note-n1', 'note-n2']);
  const seen = { readAll: 999999 }; // «Прочитати всі» не позначає оголошення прочитаними
  assert.equal(isUnread(items[0], seen), true);
  assert.equal(isUnread(items[1], seen), false);
});
