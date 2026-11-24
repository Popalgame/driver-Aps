import { breakMs, workMs, totalSince, clock, hm, startOfDay, startOfWeek, startOfMonth } from './time.js';
import { shiftsToCsv, downloadCsv } from './report.js';
import * as cloud from './cloud.js';
import { startManager, stopManager } from './manager.js';

// Зміна: { id, start, end|null, breaks: [{start, end|null}], note }  (час у мс)
// У хмарі ще: uid, driverName, updatedAt.
const KEY = 'driver-shifts-v1';
const $ = (id) => document.getElementById(id);

let shifts = [];
let store = null;   // { put(shift), remove(id), stop() }
let profile = null; // у хмарному режимі: { uid, name, email, role }

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- Сховища ----------

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

function localStore(onChange) {
  let list = loadLocal();
  const commit = () => {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* сховище недоступне */ }
    onChange(list);
  };
  onChange(list);
  return {
    put(s) { list = list.filter((x) => x.id !== s.id).concat(s); commit(); },
    remove(id) { list = list.filter((x) => x.id !== id); commit(); },
    stop() {},
  };
}

function cloudStore(user, onChange) {
  const stop = cloud.watchMyShifts(user.uid, onChange, showCloudError);
  const fail = (e) => showCloudError(e);
  return {
    put(s) { cloud.putShift({ ...s, uid: user.uid, driverName: user.name }).catch(fail); },
    remove(id) { cloud.removeShift(id).catch(fail); },
    stop,
  };
}

function showCloudError(e) {
  console.error(e);
  $('modeNote').textContent = e?.code === 'permission-denied'
    ? '⚠ Немає доступу до даних. Перевір правила Firestore.'
    : '⚠ Помилка бази даних: ' + (e?.message || e);
}

const active = () => shifts.find((s) => s.end == null);
const onBreak = (s) => s && s.breaks.some((b) => b.end == null);
const copy = (s) => ({ ...s, breaks: s.breaks.map((b) => ({ ...b })) });

const timeFmt = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });

// ---------- Дії водія ----------
$('mainBtn').addEventListener('click', () => {
  const cur = active();
  const now = Date.now();
  if (cur) {
    if (!confirm('Закінчити роботу?')) return;
    const s = copy(cur);
    s.breaks.forEach((b) => { if (b.end == null) b.end = now; });
    s.end = now;
    store.put(s);
  } else {
    store.put({ id: newId(), start: now, end: null, breaks: [], note: '' });
  }
});

$('breakBtn').addEventListener('click', () => {
  const cur = active();
  if (!cur) return;
  const s = copy(cur);
  const open = s.breaks.find((b) => b.end == null);
  if (open) open.end = Date.now();
  else s.breaks.push({ start: Date.now(), end: null });
  store.put(s);
});

$('exportBtn').addEventListener('click', () => {
  downloadCsv(shiftsToCsv(shifts), `zminy-${new Date().toISOString().slice(0, 10)}.csv`);
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
    if (confirm('Видалити цю зміну?')) store.remove(editing.id);
  } else if (action === 'save') {
    const start = new Date($('eStart').value).getTime();
    const end = new Date($('eEnd').value).getTime();
    const brk = Math.max(0, Number($('eBreak').value) || 0) * 60000;
    if (!(end > start)) { e.preventDefault(); $('eErr').textContent = 'Кінець має бути пізніше за початок.'; return; }
    if (brk >= end - start) { e.preventDefault(); $('eErr').textContent = 'Перерви довші за саму зміну.'; return; }
    // Перерви зберігаємо як один блок — точні межі після редагування не важливі
    store.put({
      ...editing,
      start, end,
      breaks: brk ? [{ start: end - brk, end }] : [],
      note: $('eNote').value.trim(),
    });
  }
  editing = null;
});

// ---------- Відображення водія ----------
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
  $('sToday').textContent = hm(totalSince(shifts, startOfDay()));
  $('sWeek').textContent = hm(totalSince(shifts, startOfWeek()));
  $('sMonth').textContent = hm(totalSince(shifts, startOfMonth()));
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

function setShifts(list) {
  shifts = list;
  render();
}

// ---------- Екрани ----------
function show(view) {
  $('loading').hidden = view !== 'loading';
  $('authView').hidden = view !== 'auth';
  $('mainView').hidden = view !== 'main';
}

function setTab(tab) {
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  $('driverView').hidden = tab !== 'driver';
  $('managerView').hidden = tab !== 'manager';
  if (tab === 'manager') startManager(profile);
  else stopManager();
}
for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => setTab(b.dataset.tab));

function updateModeNote() {
  if (!profile) {
    $('modeNote').textContent = 'Дані зберігаються лише на цьому пристрої.';
  } else {
    $('modeNote').textContent = navigator.onLine
      ? 'Дані синхронізуються з хмарою.'
      : 'Без інтернету: зміни збережено, синхронізуються пізніше.';
  }
}
addEventListener('online', updateModeNote);
addEventListener('offline', updateModeNote);

// ---------- Вхід ----------
let authMode = 'login';
function setAuthMode(m) {
  authMode = m;
  for (const b of document.querySelectorAll('[data-auth]')) b.classList.toggle('on', b.dataset.auth === m);
  $('nameRow').hidden = m !== 'register';
  $('authSubmit').textContent = m === 'register' ? 'Зареєструватися' : 'Увійти';
  $('aPass').autocomplete = m === 'register' ? 'new-password' : 'current-password';
  $('aErr').textContent = '';
}
for (const b of document.querySelectorAll('[data-auth]')) b.addEventListener('click', () => setAuthMode(b.dataset.auth));

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('aName').value.trim();
  const email = $('aEmail').value.trim();
  const pass = $('aPass').value;
  if (authMode === 'register' && !name) { $('aErr').textContent = 'Введи ім\'я — його побачить керівник.'; return; }
  $('authSubmit').disabled = true;
  $('aErr').textContent = '';
  try {
    if (authMode === 'register') await cloud.register(name, email, pass);
    else await cloud.signIn(email, pass);
  } catch (err) {
    $('aErr').textContent = cloud.authError(err);
  } finally {
    $('authSubmit').disabled = false;
  }
});

$('googleBtn').addEventListener('click', () => {
  cloud.googleSignIn().catch((err) => { $('aErr').textContent = cloud.authError(err); });
});

$('resetBtn').addEventListener('click', async () => {
  const email = $('aEmail').value.trim();
  if (!email) { $('aErr').textContent = 'Введи email, і ми надішлемо посилання для зміни пароля.'; return; }
  try {
    await cloud.resetPassword(email);
    $('aErr').textContent = 'Лист для зміни пароля надіслано на ' + email;
  } catch (err) {
    $('aErr').textContent = cloud.authError(err);
  }
});

$('logoutBtn').addEventListener('click', () => {
  if (confirm('Вийти з облікового запису?')) cloud.logout();
});

// Зміни, записані на цьому пристрої до входу, переносимо в обліковий запис
function offerMigration() {
  const local = loadLocal();
  if (!local.length) return;
  if (!confirm(`На цьому пристрої є ${local.length} змін(и), записаних без входу. Перенести їх у твій обліковий запис?`)) return;
  for (const s of local) store.put({ ...s, id: newId() });
  try { localStorage.removeItem(KEY); } catch { /* немає доступу */ }
}

function onProfile(p) {
  store?.stop();
  stopManager();
  profile = p;
  if (!p) {
    store = null;
    shifts = [];
    $('userChip').hidden = true;
    setAuthMode('login');
    show('auth');
    return;
  }
  $('userName').textContent = p.name;
  $('userChip').hidden = false;
  store = cloudStore(p, setShifts);
  $('tabs').hidden = p.role !== 'manager';
  setTab('driver');
  show('main');
  updateModeNote();
  if (p.error) showCloudError(p.error);
  offerMigration();
}

// ---------- Старт ----------
async function boot() {
  if (!cloud.cloudEnabled) {
    store = localStore(setShifts);
    show('main');
    updateModeNote();
    return;
  }
  show('loading');
  try {
    await cloud.initCloud();
    cloud.onUser(onProfile);
  } catch (e) {
    // SDK не завантажився (напр., перший запуск без інтернету) — працюємо локально
    console.error(e);
    store = localStore(setShifts);
    show('main');
    $('modeNote').textContent = '⚠ Не вдалося підключитися до хмари — дані зберігаються на цьому пристрої.';
  }
}

boot();
setInterval(() => { if (store) renderNow(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && store) render(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
