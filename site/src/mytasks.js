// «Мій час» → блок «Завдання»: мої (взяв / в дорозі), вільні (потрібен водій) і виконані за місяць.
// Дані — зі спільної підписки (feed.js); кнопки — ті самі, що в календарі.
import * as feed from './feed.js';
import { startOfMonth } from './time.js';
import { dayKey } from './mileage-calc.js';
import { keyToDate, peopleText, COLORS } from './calendar-calc.js';
import { myTasks } from './tasks.js';
import { taskBar } from './calendar.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const dateFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
const doneFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

let unsub = null, st = null;

export function startMyTasks() {
  unsub?.();
  unsub = feed.subscribe((s) => { st = s; render(); });
}
export function stopMyTasks() { unsub?.(); unsub = null; $('taskBox').hidden = true; }

function card(e, projects, withBar) {
  const p = projects.find((x) => x.id === e.project);
  const li = el('li', 'cal-ev');
  li.style.setProperty('--c', COLORS[p?.color ?? 0]);
  const top = el('div', 'ev-top');
  top.append(el('span', 'ev-date', cap(dateFmt.format(keyToDate(e.date)))));
  if (e.time) top.append(el('span', 'ev-time', e.time));
  top.append(el('b', 'ev-what', e.title));
  li.append(top);
  const meta = [e.people ? peopleText(e.people) : '', p?.name, e.byName ? 'від ' + e.byName : ''].filter(Boolean).join(' · ');
  if (meta) li.append(el('div', 'ev-meta', meta));
  if (e.note) li.append(el('div', 'ev-note', e.note));
  if (withBar) li.append(taskBar(e, st.user, render));
  else li.append(el('div', 'ev-meta task-when', '✓ ' + doneFmt.format(e.doneAt)));
  return li;
}

// Підсумок для плитки «Завдання» на «Мій час»
const tell = (c) => document.dispatchEvent(new CustomEvent('mytasks', { detail: c }));

function render() {
  const box = $('taskBox');
  // Завдання — лише водіям (не працівникам і не кадрам)
  if (!st?.user || st.user.role !== 'driver' || st.user.kind === 'emp') { box.hidden = true; tell(null); return; }
  const today = dayKey(Date.now());
  const m = myTasks(st.events.filter((e) => st.projects.some((p) => p.id === e.project)), st.user.uid, today, +startOfMonth());
  box.hidden = false;
  $('taskNone').hidden = !!(m.active.length || m.free.length || m.done.length);
  tell({ active: m.active.length, free: m.free.length, done: m.done.length });
  $('taskCount').textContent = m.active.length ? `моїх: ${m.active.length}` : '';
  $('taskActive').replaceChildren(...m.active.map((e) => card(e, st.projects, true)));
  $('taskFreeTitle').hidden = !m.free.length;
  $('taskFree').replaceChildren(...m.free.map((e) => card(e, st.projects, true)));
  $('taskDoneBox').hidden = !m.done.length;
  $('taskDoneTitle').textContent = `Виконано цього місяця: ${m.done.length}`;
  $('taskDone').replaceChildren(...m.done.map((e) => card(e, st.projects, false)));
}
