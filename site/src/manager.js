// Панель керівника: усі водії, хто зараз у дорозі, підсумки за період, Excel,
// додавання водіїв, підтвердження й закриття доступу.
import { hm, startOfDay, startOfWeek, startOfMonth } from './time.js';
import { summarizeByDriver } from './report.js';
import * as cloud from './cloud.js';
import { openProfile, refreshProfile } from './profile.js';

const $ = (id) => document.getElementById(id);
const DAY = 24 * 3600e3;

let running = false;
let period = 'day';
let users = [];
let shifts = [];
let range = null;
let stopUsers = null, stopShifts = null, timer = null;

const timeFmt = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
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
  stopUsers = cloud.watchUsers((list) => { users = list; render(); refreshProfile(); }, showError);
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

$('mExportBtn').addEventListener('click', async () => {
  if (!range) return;
  const { exportTeam } = await import('./export.js');
  const label = period === 'custom'
    ? `${dateLong.format(range[0])} – ${dateLong.format(range[1] - 1)}`
    : { day: 'сьогодні', week: 'цей тиждень', month: 'цей місяць' }[period];
  exportTeam(shifts, users, range[0], range[1], label);
});

// ---------- Додати водія ----------
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');

function genPassword() {
  // Без схожих символів (0/O, 1/l/I), щоб легко продиктувати
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rnd = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(rnd, (n) => abc[n % abc.length]).join('');
}

function openAddDriver() {
  $('driverForm').reset();
  $('dPass').value = genPassword();
  $('dFields').hidden = false;
  $('dDone').hidden = true;
  $('dSubmit').hidden = false;
  $('dSubmit').disabled = false;
  $('dErr').textContent = '';
  $('driverDlg').showModal();
  $('dName').focus();
}

$('addDriverBtn').addEventListener('click', openAddDriver);
$('dGen').addEventListener('click', () => { $('dPass').value = genPassword(); });
$('dCancel').addEventListener('click', () => $('driverDlg').close());
$('dCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('dCreds').textContent);
    $('dCopy').textContent = 'Скопійовано ✓';
  } catch {
    $('dCopy').textContent = 'Виділи текст і скопіюй вручну';
  }
});

$('driverForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('dName').value.trim();
  const email = $('dEmail').value.trim().toLowerCase();
  const pass = $('dPass').value.trim();
  if (!name) { $('dErr').textContent = 'Введи ім\'я водія.'; return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('dErr').textContent = 'Перевір email.'; return; }
  if (pass.length < 6) { $('dErr').textContent = 'Пароль — щонайменше 6 символів.'; return; }
  $('dSubmit').disabled = true;
  $('dErr').textContent = 'Додаю…';
  try {
    await cloud.createDriver(name, email, pass);
    $('dErr').textContent = '';
    $('dCreds').textContent = `Driver-Aps\n${APP_URL}\nEmail: ${email}\nПароль: ${pass}`;
    $('dCopy').textContent = 'Скопіювати';
    $('dFields').hidden = true;
    $('dDone').hidden = false;
    $('dSubmit').hidden = true;
  } catch (err) {
    console.error(err);
    $('dErr').textContent = err?.code?.startsWith('auth/') ? cloud.authError(err) : 'Помилка: ' + (err?.message || err);
    $('dSubmit').disabled = false;
  }
});

function setRole(uid, role, ask) {
  if (ask && !confirm(ask)) return;
  cloud.setUserRole(uid, role).catch(showError);
}

function renderPending() {
  const pending = users.filter((u) => u.role === 'pending');
  $('pendingBox').hidden = pending.length === 0;
  const ul = $('pendingList');
  ul.replaceChildren();
  for (const u of pending) {
    const li = el('li', 'pend');
    const l = el('div');
    l.append(el('div', 'dname', u.name || 'Без імені'), el('div', 'n', u.email || ''));
    const btns = el('span', 'actions');
    const ok = el('button', 'btn small start', 'Підтвердити');
    ok.type = 'button';
    ok.addEventListener('click', () => setRole(u.id, 'driver'));
    const no = el('button', 'btn small danger', 'Відхилити');
    no.type = 'button';
    no.addEventListener('click', () => setRole(u.id, 'disabled', `Відхилити ${u.email}? Доступу не буде.`));
    btns.append(no, ok);
    li.append(l, btns);
    ul.append(li);
  }
}

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });

function render() {
  if (!running || !range) return;
  renderPending();
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
    const off = r.role === 'disabled';
    const li = el('li', 'driver card' + (off ? ' off' : ''));
    const head = el('div', 'row');
    const left = el('div');
    left.append(el('div', 'dname', r.name));
    let status = 'Не на зміні', cls = 'badge';
    if (off) {
      status = 'Доступ закрито'; cls = 'badge off';
    } else if (r.active) {
      status = r.onBreak ? `☕ Перерва · з ${timeFmt.format(r.active.start)}` : `● У дорозі з ${timeFmt.format(r.active.start)}`;
      cls = 'badge ' + (r.onBreak ? 'pause' : 'on');
    }
    left.append(el('div', cls, status));
    const right = el('div', 'dtotal');
    right.append(el('b', '', hm(r.total)), el('span', 'muted', `${r.count} змін(и)`));
    head.append(left, right);
    li.append(head);

    li.append(el('span', 'chev', '›'));
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Відкрити сторінку водія ${r.name}`);
    const openIt = () => {
      $('managerView').hidden = true;
      openProfile(
        r.uid,
        (id) => users.find((u) => u.id === id) || { name: r.name, email: r.email, role: r.role },
        setRole,
        () => { $('managerView').hidden = false; $('pageTitle').textContent = 'Водії'; render(); },
      );
    };
    li.addEventListener('click', openIt);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(); } });
    list.append(li);
  }
}
