// Панель керівника: усі водії, хто зараз у дорозі, підсумки за період, Excel,
// додавання водіїв, підтвердження й закриття доступу.
import { hm, startOfDay, startOfWeek, startOfMonth } from './time.js';
import { summarizeByDriver } from './report.js';
import { distanceIn } from './mileage-calc.js';
import * as cloud from './cloud.js';
import { openProfile, refreshProfile } from './profile.js';
import { iconText } from './icons.js';
import * as feed from './feed.js';

const $ = (id) => document.getElementById(id);
const DAY = 24 * 3600e3;

let running = false;
let period = 'day';
let users = [];
let shifts = [];
let range = null;
let stopUsers = null, stopShifts = null, timer = null;
let mileage = [], stopMileageW = null;
let unsubFeed = null;
const kmFmt = new Intl.NumberFormat('uk-UA');

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
  // Кілометраж: пробіг періоду рахується до першого показника після нього — беремо з запасом
  stopMileageW?.();
  mileage = [];
  stopMileageW = cloud.watchAllMileage(range[0], range[1] + 40 * DAY, (list) => { mileage = list; render(); }, (e) => console.error(e));
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
  unsubFeed = feed.subscribe(() => { if (running) renderHr(); });
  subscribe();
  timer = setInterval(render, 30000);
}

export function stopManager() {
  if (!running) return;
  running = false;
  unsubFeed?.(); unsubFeed = null;
  stopUsers?.(); stopShifts?.(); stopMileageW?.(); clearInterval(timer);
  stopMileageW = null;
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
  exportTeam(shifts, users, range[0], range[1], label, mileage);
});

// ---------- Додати водія ----------
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');

function genPassword() {
  // Без схожих символів (0/O, 1/l/I), щоб легко продиктувати
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rnd = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(rnd, (n) => abc[n % abc.length]).join('');
}

let onDriverCreated = null;

// onCreated(uid, name) — напр., щоб одразу додати нового водія до проєкту
// role: 'driver' або 'hr' (кадровик)
let newRole = 'driver';
export function openAddDriver(onCreated = null, title = 'Новий водій', role = 'driver') {
  onDriverCreated = onCreated;
  newRole = role;
  $('dTitle').textContent = title;
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

$('addDriverBtn').addEventListener('click', () => openAddDriver());
$('addHrBtn').addEventListener('click', () => openAddDriver(null, 'Новий кадровик', 'hr'));
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
  if (!name) { $('dErr').textContent = 'Введи ім\'я та прізвище.'; return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('dErr').textContent = 'Перевір email.'; return; }
  if (pass.length < 6) { $('dErr').textContent = 'Пароль — щонайменше 6 символів.'; return; }
  $('dSubmit').disabled = true;
  $('dErr').textContent = 'Додаю…';
  try {
    const uid = await cloud.createDriver(name, email, pass, newRole);
    $('dDoneText').textContent = newRole === 'hr' ? 'Кадровика додано. Передай дані для входу:' : 'Водія додано. Передай йому дані для входу:';
    onDriverCreated?.(uid, name);
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

// Кадри: список, проєкти, доступ
function renderHr() {
  const hr = users.filter((u) => u.kind === 'hr').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'));
  $('hrEmpty').hidden = hr.length > 0;
  $('hrList').replaceChildren(...hr.map((u) => {
    const off = u.role === 'disabled';
    const li = el('li', 'pend' + (off ? ' off' : ''));
    const l = el('div');
    const projs = feed.state.projects.filter((p) => (p.hr || []).includes(u.id)).map((p) => p.name);
    l.append(el('div', 'dname', u.name || 'Без імені'), el('div', 'n', u.email || ''));
    l.append(el('div', off ? 'badge off' : 'badge', off ? 'Доступ закрито' : projs.length ? 'Проєкти: ' + projs.join(', ') : 'Ще не додана до проєкту'));
    const b = el('button', 'btn small ' + (off ? 'start' : 'danger'), off ? 'Відкрити доступ' : 'Закрити доступ');
    b.type = 'button';
    b.addEventListener('click', () => (off ? setRole(u.id, 'hr') : setRole(u.id, 'disabled', `Закрити доступ для «${u.name}»?`)));
    li.append(l, b);
    return li;
  }));
}

function render() {
  if (!running || !range) return;
  renderPending();
  renderHr();
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
      status = r.onBreak ? `Перерва · з ${timeFmt.format(r.active.start)}` : `● У дорозі з ${timeFmt.format(r.active.start)}`;
      cls = 'badge ' + (r.onBreak ? 'pause' : 'on');
    }
    const badge = el('div', cls, status);
    if (r.active && r.onBreak) iconText(badge, 'coffee', status);
    left.append(badge);
    const right = el('div', 'dtotal');
    right.append(el('b', '', hm(r.total)), el('span', 'muted', `${r.count} змін(и)`));
    const mine = mileage.filter((e) => e.uid === r.uid);
    if (mine.length) right.append(iconText(el('span', 'dkm'), 'car', `${kmFmt.format(distanceIn(mine, range[0], range[1]))} км`));
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
