// Панель керівника: усі водії, хто зараз у дорозі, підсумки за період, CSV.
import { breakMs, workMs, workInRange, hm, startOfDay, startOfWeek, startOfMonth } from './time.js';
import { summarizeByDriver, shiftsToCsv, downloadCsv } from './report.js';
import * as cloud from './cloud.js';

const $ = (id) => document.getElementById(id);
const DAY = 24 * 3600e3;

let running = false;
let period = 'day';
let users = [];
let shifts = [];
let range = null;
let stopUsers = null, stopShifts = null, timer = null;
const open = new Set(); // розгорнуті водії

const timeFmt = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' });
const dateLong = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
const isoDay = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };

function computeRange() {
  const now = new Date();
  if (period === 'day') { const f = startOfDay(now); return [+f, +f + DAY]; }
  if (period === 'week') { const f = startOfWeek(now); const t = new Date(f); t.setDate(t.getDate() + 7); return [+f, +t]; }
  if (period === 'month') { const f = startOfMonth(now); const t = new Date(f); t.setMonth(t.getMonth() + 1); return [+f, +t]; }
  const f = $('pFrom').value ? startOfDay(new Date($('pFrom').value + 'T00:00')) : startOfMonth(now);
  const t = $('pTo').value ? startOfDay(new Date($('pTo').value + 'T00:00')) : startOfDay(now);
  t.setDate(t.getDate() + 1);
  return [+f, Math.max(+t, +f + DAY)];
}

function showError(e) {
  console.error(e);
  $('mErr').textContent = e?.code === 'permission-denied'
    ? 'Немає доступу. У Firebase Console у users/{твій uid} має бути role: "manager".'
    : 'Помилка: ' + (e?.message || e);
}

function subscribe() {
  stopShifts?.();
  range = computeRange();
  shifts = [];
  // Зміни, що почались до 24 год раніше, теж можуть заходити в період (нічні зміни)
  stopShifts = cloud.watchAllShifts(range[0] - DAY, range[1], (list) => { shifts = list; $('mErr').textContent = ''; render(); }, showError);
  render();
}

export function startManager() {
  if (running) return;
  running = true;
  if (!$('pFrom').value) {
    $('pFrom').value = isoDay(startOfMonth());
    $('pTo').value = isoDay(new Date());
  }
  stopUsers = cloud.watchUsers((list) => { users = list; render(); }, showError);
  subscribe();
  timer = setInterval(render, 30000);
}

export function stopManager() {
  if (!running) return;
  running = false;
  stopUsers?.(); stopShifts?.(); clearInterval(timer);
  stopUsers = stopShifts = null;
}

for (const b of document.querySelectorAll('#period button')) {
  b.addEventListener('click', () => {
    period = b.dataset.p;
    for (const x of document.querySelectorAll('#period button')) x.classList.toggle('on', x === b);
    $('customRange').hidden = period !== 'custom';
    if (running) subscribe();
  });
}
for (const id of ['pFrom', 'pTo']) $(id).addEventListener('change', () => { if (running) subscribe(); });

$('mExportBtn').addEventListener('click', () => {
  if (!range) return;
  const inRange = shifts.filter((s) => workInRange(s, range[0], range[1]) > 0);
  const names = new Map(users.map((u) => [u.id, u.name]));
  downloadCsv(shiftsToCsv(inRange, names), `vodii-${isoDay(range[0])}_${isoDay(range[1] - 1)}.csv`);
});

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });

function render() {
  if (!running || !range) return;
  const now = Date.now();
  const rows = summarizeByDriver(shifts, users, range[0], range[1], now);
  const list = $('drivers');
  list.replaceChildren();
  $('mEmpty').hidden = rows.length > 0;

  const onShift = rows.filter((r) => r.active).length;
  const total = rows.reduce((a, r) => a + r.total, 0);
  const periodLabel = period === 'custom'
    ? `${dateLong.format(range[0])} – ${dateLong.format(range[1] - 1)}`
    : { day: 'сьогодні', week: 'цей тиждень', month: 'цей місяць' }[period];
  $('mSummary').textContent = `${periodLabel}: ${hm(total)} · у дорозі зараз: ${onShift}`;

  for (const r of rows) {
    const li = el('li', 'driver card');
    const head = el('div', 'row');
    const left = el('div');
    left.append(el('div', 'dname', r.name));
    let status = 'Не на зміні', cls = 'badge';
    if (r.active) {
      status = r.onBreak ? `☕ Перерва · з ${timeFmt.format(r.active.start)}` : `● У дорозі з ${timeFmt.format(r.active.start)}`;
      cls = 'badge ' + (r.onBreak ? 'pause' : 'on');
    }
    left.append(el('div', cls, status));
    const right = el('div', 'dtotal');
    right.append(el('b', '', hm(r.total)), el('span', 'muted', `${r.count} змін(и)`));
    head.append(left, right);
    li.append(head);

    if (open.has(r.uid)) {
      const ul = el('ul', 'history');
      if (!r.shifts.length) ul.append(el('li', 'muted', 'Немає змін за цей період.'));
      for (const s of r.shifts) {
        const item = el('li', 'shift static');
        const l = el('div');
        const endTxt = s.end == null ? 'зараз' : timeFmt.format(s.end);
        l.append(el('div', 't', `${dateFmt.format(s.start)} · ${timeFmt.format(s.start)} – ${endTxt}`));
        const b = breakMs(s, now);
        const meta = [b >= 60000 ? `перерви ${hm(b)}` : '', s.note].filter(Boolean).join(' · ');
        if (meta) l.append(el('div', 'n', meta));
        item.append(l, el('div', 'd', hm(workMs(s, now))));
        ul.append(item);
      }
      li.append(ul);
    }
    li.addEventListener('click', () => {
      if (open.has(r.uid)) open.delete(r.uid); else open.add(r.uid);
      render();
    });
    list.append(li);
  }
}
