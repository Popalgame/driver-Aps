import { breakMs, workMs, totalSince, clock, hm, startOfDay, startOfWeek, startOfMonth } from './time.js';

// Модель: { id, start, end|null, breaks: [{start, end|null}], note }  (час у мс)
const KEY = 'driver-shifts-v1';
const $ = (id) => document.getElementById(id);

let shifts = load();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(shifts)); } catch { /* сховище недоступне */ }
}

const active = () => shifts.find((s) => s.end == null);
const onBreak = (s) => s && s.breaks.some((b) => b.end == null);

const timeFmt = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });

const total = (from) => totalSince(shifts, from);

// ---------- Дії ----------
$('mainBtn').addEventListener('click', () => {
  const s = active();
  const now = Date.now();
  if (s) {
    if (!confirm('Закінчити роботу?')) return;
    s.breaks.forEach((b) => { if (b.end == null) b.end = now; });
    s.end = now;
  } else {
    shifts.push({ id: now.toString(36), start: now, end: null, breaks: [], note: '' });
  }
  save(); render();
});

$('breakBtn').addEventListener('click', () => {
  const s = active();
  if (!s) return;
  const open = s.breaks.find((b) => b.end == null);
  if (open) open.end = Date.now();
  else s.breaks.push({ start: Date.now(), end: null });
  save(); render();
});

$('exportBtn').addEventListener('click', () => {
  const rows = [['Дата', 'Початок', 'Кінець', 'Перерви (хв)', 'Робочий час (год)', 'Нотатка']];
  for (const s of [...shifts].sort((a, b) => a.start - b.start)) {
    if (s.end == null) continue;
    rows.push([
      new Date(s.start).toLocaleDateString('uk-UA'),
      timeFmt.format(s.start),
      timeFmt.format(s.end),
      Math.round(breakMs(s) / 60000),
      (workMs(s) / 3600000).toFixed(2).replace('.', ','),
      s.note || '',
    ]);
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `zminy-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ---------- Редагування ----------
let editing = null;
const toLocal = (ms) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function openEdit(s) {
  editing = s;
  $('eStart').value = toLocal(s.start);
  $('eEnd').value = toLocal(s.end);
  $('eBreak').value = Math.round(breakMs(s) / 60000);
  $('eNote').value = s.note || '';
  $('eErr').textContent = '';
  $('editDlg').showModal();
}

$('editForm').addEventListener('submit', (e) => {
  const action = e.submitter?.value;
  if (!editing) return;
  if (action === 'delete') {
    if (confirm('Видалити цю зміну?')) shifts = shifts.filter((s) => s !== editing);
  } else if (action === 'save') {
    const start = new Date($('eStart').value).getTime();
    const end = new Date($('eEnd').value).getTime();
    const brk = Math.max(0, Number($('eBreak').value) || 0) * 60000;
    if (!(end > start)) { e.preventDefault(); $('eErr').textContent = 'Кінець має бути пізніше за початок.'; return; }
    if (brk >= end - start) { e.preventDefault(); $('eErr').textContent = 'Перерви довші за саму зміну.'; return; }
    editing.start = start;
    editing.end = end;
    // Перерви зберігаємо як один блок — точні межі після редагування не важливі
    editing.breaks = brk ? [{ start: end - brk, end }] : [];
    editing.note = $('eNote').value.trim();
  }
  editing = null;
  save(); render();
});

// ---------- Відображення ----------
function renderNow() {
  const s = active();
  const now = Date.now();
  const main = $('mainBtn'), brk = $('breakBtn'), st = $('status');
  if (!s) {
    st.textContent = 'Не на зміні'; st.className = 'status';
    $('timer').textContent = '00:00:00';
    $('sub').innerHTML = '&nbsp;';
    main.textContent = '▶ Почати роботу'; main.className = 'btn big start';
    brk.hidden = true;
  } else {
    const paused = onBreak(s);
    st.textContent = paused ? 'Перерва' : 'У дорозі';
    st.className = 'status ' + (paused ? 'pause' : 'on');
    $('timer').textContent = clock(workMs(s, now));
    const b = breakMs(s, now);
    $('sub').textContent = `Почато о ${timeFmt.format(s.start)}` + (b >= 60000 ? ` · перерви ${hm(b)}` : '');
    main.textContent = '■ Закінчити роботу'; main.className = 'btn big stop';
    brk.hidden = false;
    brk.textContent = paused ? '▶ Продовжити' : '☕ Перерва';
    brk.classList.toggle('active', paused);
  }
  $('sToday').textContent = hm(total(startOfDay()));
  $('sWeek').textContent = hm(total(startOfWeek()));
  $('sMonth').textContent = hm(total(startOfMonth()));
}

function renderHistory() {
  const list = $('history');
  list.replaceChildren();
  const done = shifts.filter((s) => s.end != null).sort((a, b) => b.start - a.start);
  $('empty').hidden = done.length > 0;
  const groups = new Map();
  for (const s of done) {
    const k = +startOfDay(new Date(s.start));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  for (const [day, items] of groups) {
    const h = document.createElement('li');
    h.className = 'day';
    const label = dayFmt.format(day);
    h.append(Object.assign(document.createElement('span'), { textContent: label[0].toUpperCase() + label.slice(1) }));
    h.append(Object.assign(document.createElement('span'), { textContent: hm(items.reduce((a, s) => a + workMs(s), 0)) }));
    list.append(h);
    for (const s of items) {
      const li = document.createElement('li');
      li.className = 'shift';
      const left = document.createElement('div');
      left.append(Object.assign(document.createElement('div'), { className: 't', textContent: `${timeFmt.format(s.start)} – ${timeFmt.format(s.end)}` }));
      const b = breakMs(s);
      const meta = [b >= 60000 ? `перерви ${hm(b)}` : '', s.note].filter(Boolean).join(' · ');
      if (meta) left.append(Object.assign(document.createElement('div'), { className: 'n', textContent: meta }));
      li.append(left, Object.assign(document.createElement('div'), { className: 'd', textContent: hm(workMs(s)) }));
      li.addEventListener('click', () => openEdit(s));
      list.append(li);
    }
  }
}

function render() { renderNow(); renderHistory(); }

render();
setInterval(renderNow, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
