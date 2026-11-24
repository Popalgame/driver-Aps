import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actions, statusText, myTasks, statusOf } from '../site/src/tasks.js';

const t = (extra) => ({ id: 'x', need: true, status: 'open', driver: null, date: '2026-11-25', time: '07:00', title: 'Медкомісія', ...extra });

test('шлях завдання: беру → забрав → виконано', () => {
  let e = t();
  let a = actions(e, 'me', 'Андрій', 'driver', 5);
  assert.equal(a.main.label, 'Беру завдання');
  e = { ...e, ...a.main.patch };
  assert.equal(statusText(e), 'Взяв: Андрій');
  a = actions(e, 'me', 'Андрій', 'driver', 6);
  assert.equal(a.main.label, 'Забрав людей — їду');
  assert.equal(a.undo.label, 'Відмовитись');
  e = { ...e, ...a.main.patch };
  assert.equal(statusText(e), 'В дорозі: Андрій');
  a = actions(e, 'me', 'Андрій', 'driver', 7);
  e = { ...e, ...a.main.patch };
  assert.equal(statusText(e), 'Виконано: Андрій');
  assert.equal(e.doneAt, 7);
  assert.equal(actions(e, 'me', 'Андрій', 'driver').main, null);
});

test('чуже завдання, кадри, керівник і звичайна подія — без кнопок', () => {
  const taken = t({ status: 'taken', driver: 'bob', driverName: 'Богдан' });
  assert.deepEqual(actions(taken, 'me', 'А', 'driver'), { main: null, undo: null });
  assert.equal(actions(t(), 'h', 'Ольга', 'hr').main, null);
  assert.equal(actions(t(), 'b', 'Денис', 'manager').main, null);
  assert.equal(statusOf({ title: 'Огляд авто' }), null);
  // відмовитись — знову вільне
  const back = { ...taken, ...actions({ ...taken, driver: 'me' }, 'me', 'А', 'driver').undo.patch };
  assert.equal(back.status, 'open');
  assert.equal(back.driver, null);
});

test('мої завдання: активні, вільні, виконані', () => {
  const ev = [
    t({ id: 'free' }),
    t({ id: 'old', date: '2026-11-01' }),
    t({ id: 'mine', status: 'onway', driver: 'me' }),
    t({ id: 'other', status: 'taken', driver: 'bob' }),
    t({ id: 'done', status: 'done', driver: 'me', doneAt: 100 }),
    { id: 'plain', date: '2026-11-25', title: 'Огляд' },
  ];
  const m = myTasks(ev, 'me', '2026-11-24', 50);
  assert.deepEqual(m.active.map((e) => e.id), ['mine']);
  assert.deepEqual(m.free.map((e) => e.id), ['free']);
  assert.deepEqual(m.done.map((e) => e.id), ['done']);
  assert.equal(myTasks(ev, 'me', '2026-11-24', 200).done.length, 0);
});
