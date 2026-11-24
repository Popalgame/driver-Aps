import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, eventsByDate, upcoming, peopleText, nextColor, keyToDate } from '../site/src/calendar-calc.js';

test('сітка місяця починається з понеділка і закінчується неділею', () => {
  const g = monthGrid(new Date(2026, 11, 1)); // грудень 2026: 1-ше — вівторок
  assert.equal(g[0].key, '2026-11-30');
  assert.equal(g[0].inMonth, false);
  assert.equal(g[1].key, '2026-12-01');
  assert.equal(g.at(-1).key, '2027-01-03');
  assert.equal(g.length % 7, 0);
  assert.equal(g.filter((d) => d.inMonth).length, 31);
  const feb = monthGrid(new Date(2027, 1, 1)); // лютий 2027: з понеділка, рівно 4 тижні
  assert.equal(feb.length, 28);
  assert.equal(feb[0].key, '2027-02-01');
});

test('події по днях і найближчі — за часом', () => {
  const ev = [
    { id: 'a', date: '2026-12-03', time: '', title: 'Без часу' },
    { id: 'b', date: '2026-12-03', time: '08:00', title: 'Медкомісія' },
    { id: 'c', date: '2026-11-20', time: '07:00', title: 'Минула' },
    { id: 'd', date: '2026-12-01', time: '18:30', title: 'Інструктаж' },
  ];
  assert.deepEqual(eventsByDate(ev).get('2026-12-03').map((e) => e.id), ['b', 'a']);
  assert.deepEqual(upcoming(ev, '2026-11-24').map((e) => e.id), ['d', 'b', 'a']);
  assert.deepEqual(upcoming(ev, '2026-12-03', 1).map((e) => e.id), ['b']);
  assert.equal(+keyToDate('2026-12-03'), +new Date(2026, 11, 3));
});

test('кількість людей і кольори проєктів', () => {
  assert.equal(peopleText(1), '1 чоловік');
  assert.equal(peopleText(3), '3 чоловіки');
  assert.equal(peopleText(5), '5 чоловік');
  assert.equal(peopleText(12), '12 чоловік');
  assert.equal(peopleText(22), '22 чоловіки');
  assert.equal(peopleText(null), '');
  assert.equal(nextColor([{ color: 0 }, { color: 2 }]), 1);
});
