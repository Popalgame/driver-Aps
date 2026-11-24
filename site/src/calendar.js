// Вкладка «Календар»: події проєктів (медкомісія, інструктаж, перевезення…).
// Водій бачить і додає події лише своїх проєктів; керівник — усіх.
import * as cloud from './cloud.js';
import * as feed from './feed.js';
import { iconText } from './icons.js';
import { startOfMonth } from './time.js';
import { dayKey } from './mileage-calc.js';
import { COLORS, monthGrid, eventsByDate, upcoming, keyToDate, peopleText } from './calendar-calc.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const monthFmt = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let user = null;      // { uid, name, role }
let projects = [];
let events = [];
let month = startOfMonth();
let selected = dayKey(Date.now());
let filter = '';      // '' — усі проєкти
let unsub = null;
let editing = null;

const isManager = () => user?.role === 'manager';
const projById = (id) => projects.find((p) => p.id === id);
const colorOf = (id) => COLORS[projById(id)?.color ?? 0] || COLORS[0];
const visible = () => events.filter((e) => projById(e.project) && (!filter || e.project === filter));

function showError(e) {
  console.error(e);
  $('calNote').hidden = false;
  $('calNote').className = 'err center';
  $('calNote').textContent = e?.code === 'permission-denied'
    ? '⚠ Немає доступу до календаря. Керівнику: онови правила Firestore (site/firestore.rules).'
    : '⚠ Помилка: ' + (e?.message || e);
}

// ---------- Відкрити / закрити вкладку ----------
// Дані — зі спільної підписки (feed.js): проєкти й події вже завантажені для сповіщень
export function startCalendar() {
  unsub?.();
  unsub = feed.subscribe((st) => {
    user = st.user;
    projects = st.projects;
    events = st.events;
    if (filter && !projById(filter)) filter = '';
    if ($('calendarView').hidden) return;
    render();
    if (st.error) showError(st.error);
  });
  render();
}

export function stopCalendar() {
  unsub?.(); unsub = null;
  $('evDlg').open && $('evDlg').close();
}

// Відкрити конкретний день (зі сповіщення)
export function showDate(key, projectId) {
  selected = key;
  month = startOfMonth(keyToDate(key));
  if (projectId && projects.length > 1) filter = projectId;
  render();
}

// ---------- Відображення ----------
function render() {
  const noProj = !user || !projects.length;
  $('calNote').hidden = !noProj;
  $('calNote').className = 'muted center';
  if (!user) $('calNote').textContent = 'Календар працює після входу в обліковий запис.';
  else if (!projects.length) {
    $('calNote').textContent = isManager()
      ? 'Ще немає проєктів. Створи проєкт у вкладці «Проєкти» і додай до нього водіїв.'
      : 'Тебе ще не додано до жодного проєкту. Попроси керівника.';
  }
  $('calAdd').disabled = noProj;
  renderProjects();
  renderGrid();
  renderDay();
  renderUpcoming();
}

// Водії проєкту (без кадрів)
const teamNames = (p) => (p.members || []).map((uid) => p.names?.[uid]).filter(Boolean);

function renderProjects() {
  const box = $('calProjects');
  box.replaceChildren();
  box.hidden = !projects.length;
  const chip = (id, name, color, names) => {
    const b = el('button', 'chip' + (filter === id ? ' on' : ''));
    b.type = 'button';
    if (color) { const dot = el('span', 'dot'); dot.style.background = color; b.append(dot); }
    b.append(name);
    if (names) b.title = names;
    b.addEventListener('click', () => { filter = id; render(); });
    return b;
  };
  if (projects.length > 1) box.append(chip('', 'Усі'));
  for (const p of projects) {
    const names = teamNames(p).join(', ');
    box.append(chip(projects.length > 1 ? p.id : '', p.name, COLORS[p.color] || COLORS[0], names));
  }
  // Хто на проєкті (коли вибрано один)
  const one = filter ? projById(filter) : projects.length === 1 ? projects[0] : null;
  if (one) {
    const names = teamNames(one);
    box.append(iconText(el('p', 'cal-team muted ih'), 'users', names.length ? names.join(', ') : 'Водіїв ще не додано'));
    const hr = (one.hr || []).map((uid) => one.names?.[uid]).filter(Boolean);
    if (hr.length) box.append(iconText(el('p', 'cal-team muted ih'), 'idcard', 'Кадри: ' + hr.join(', ')));
  }
}

function renderGrid() {
  $('calMonth').textContent = cap(monthFmt.format(month));
  const today = dayKey(Date.now());
  const map = eventsByDate(visible());
  const grid = $('calGrid');
  grid.replaceChildren();
  for (const d of monthGrid(month)) {
    const list = map.get(d.key) || [];
    const b = el('button', 'cal-d' + (d.inMonth ? '' : ' out') + (d.weekend ? ' we' : '') + (d.key === today ? ' today' : '') + (d.key === selected ? ' sel' : '') + (list.length ? ' has' : ''));
    b.type = 'button';
    b.append(el('span', 'n', String(d.day)));
    const dots = el('span', 'dots');
    for (const e of list.slice(0, 3)) { const s = el('i'); s.style.background = colorOf(e.project); dots.append(s); }
    if (list.length > 3) dots.append(el('em', '', '+' + (list.length - 3)));
    b.append(dots);
    b.setAttribute('aria-label', `${cap(dayFmt.format(keyToDate(d.key)))}${list.length ? `, подій: ${list.length}` : ''}`);
    b.addEventListener('click', () => {
      selected = d.key;
      if (!d.inMonth) month = startOfMonth(keyToDate(d.key));
      render();
    });
    b.addEventListener('dblclick', () => { if (!$('calAdd').disabled) openEvent(null); });
    grid.append(b);
  }
}

function item(e, withDate) {
  const li = el('li', 'cal-ev');
  li.style.setProperty('--c', colorOf(e.project));
  li.tabIndex = 0;
  const top = el('div', 'ev-top');
  if (withDate) top.append(el('span', 'ev-date', cap(shortFmt.format(keyToDate(e.date)))));
  if (e.time) top.append(el('span', 'ev-time', e.time));
  top.append(el('b', 'ev-what', e.title));
  li.append(top);
  const meta = [];
  if (e.people) meta.push(peopleText(e.people));
  if (projects.length > 1 || isManager()) meta.push(projById(e.project)?.name || '');
  if (e.byName) meta.push('додав(ла): ' + e.byName);
  const m = el('div', 'ev-meta', meta.filter(Boolean).join(' · '));
  if (e.people) iconText(m, 'users', meta.filter(Boolean).join(' · '));
  li.append(m);
  if (e.note) li.append(el('div', 'ev-note', e.note));
  const open = () => openEvent(e);
  li.addEventListener('click', open);
  li.addEventListener('keydown', (k) => { if (k.key === 'Enter') open(); });
  return li;
}

function renderDay() {
  $('calDayTitle').textContent = cap(dayFmt.format(keyToDate(selected)));
  const list = eventsByDate(visible()).get(selected) || [];
  $('calDayList').replaceChildren(...list.map((e) => item(e, false)));
  $('calDayEmpty').hidden = list.length > 0;
}

function renderUpcoming() {
  const list = upcoming(visible(), dayKey(Date.now()));
  $('calUpList').replaceChildren(...list.map((e) => item(e, true)));
  $('calUpEmpty').hidden = list.length > 0;
}

// ---------- Навігація ----------
function shiftMonth(n) {
  month = new Date(month.getFullYear(), month.getMonth() + n, 1);
  // Вибраний день — сьогодні, якщо це поточний місяць, інакше 1-ше число
  const today = dayKey(Date.now());
  selected = today.slice(0, 7) === dayKey(+month).slice(0, 7) ? today : dayKey(+month);
  render();
}
$('calPrev').addEventListener('click', () => shiftMonth(-1));
$('calNext').addEventListener('click', () => shiftMonth(1));
$('calToday').addEventListener('click', () => { month = startOfMonth(); selected = dayKey(Date.now()); render(); });

// ---------- Діалог події ----------
function openEvent(e) {
  editing = e || null;
  const own = projects;
  const sel = $('evProject');
  sel.replaceChildren(...own.map((p) => Object.assign(el('option', '', p.name), { value: p.id })));
  sel.value = e?.project || filter || own[0]?.id || '';
  $('evProjLabel').hidden = own.length < 2 && !!sel.value;
  $('evTitle').textContent = e ? 'Подія' : 'Нова подія';
  $('evDate').value = e?.date || selected;
  $('evTime').value = e?.time || '';
  $('evWhat').value = e?.title || '';
  $('evPeople').value = e?.people ?? '';
  $('evNote').value = e?.note || '';
  $('evBy').textContent = [e?.byName && `Додав(ла): ${e.byName}`, e?.editedByName && `змінив(ла): ${e.editedByName}`].filter(Boolean).join(' · ');
  $('evDel').hidden = !e;
  $('evErr').textContent = '';
  $('evDlg').showModal();
  if (!e) $('evWhat').focus();
}

$('calAdd').addEventListener('click', () => openEvent(null));
$('evCancel').addEventListener('click', () => $('evDlg').close());
for (const b of $('evQuick').querySelectorAll('button')) {
  b.addEventListener('click', () => { $('evWhat').value = b.textContent; $('evPeople').focus(); });
}
$('evDel').addEventListener('click', () => {
  if (!editing || !confirm(`Видалити подію «${editing.title}»?`)) return;
  const id = editing.id;
  events = events.filter((x) => x.id !== id);
  render();
  cloud.removeEvent(id).catch(showError);
  $('evDlg').close();
});

$('evForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const err = (t) => { $('evErr').textContent = t; };
  const project = $('evProject').value;
  const date = $('evDate').value;
  const title = $('evWhat').value.trim().replace(/\s+/g, ' ');
  const pRaw = String($('evPeople').value).replace(/\s/g, '');
  const people = pRaw === '' ? null : Number(pRaw);
  if (!project) return err('Вибери проєкт.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('Вкажи дату.');
  if (!title) return err('Напиши, що за подія (напр. «Медкомісія»).');
  if (people != null && !(Number.isInteger(people) && people >= 1 && people <= 999)) return err('Кількість людей — ціле число від 1 до 999.');
  const now = Date.now();
  const e = {
    id: editing?.id || newId(),
    project, date, time: $('evTime').value || '', title, people,
    note: $('evNote').value.trim(),
    by: editing?.by || user.uid,
    byName: editing?.byName || user.name || '',
    createdAt: editing?.createdAt || now,
  };
  if (editing) Object.assign(e, { editedBy: user.uid, editedByName: user.name || '' });
  if (editing && editing.project !== project) {
    // Проєкт змінено: нова подія в іншому проєкті, стару видаляємо
    cloud.removeEvent(editing.id).catch(showError);
    Object.assign(e, { id: newId(), by: user.uid, byName: user.name || '', createdAt: now });
    delete e.editedBy; delete e.editedByName;
  }
  events = events.filter((x) => x.id !== e.id && x.id !== editing?.id).concat({ ...e, updatedAt: now });
  selected = date;
  month = startOfMonth(keyToDate(date));
  render();
  cloud.putEvent(e).catch(showError);
  $('evDlg').close();
});
