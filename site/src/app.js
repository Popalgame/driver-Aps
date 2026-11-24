import { breakMs, workMs, totalSince, clock, hm, startOfDay, startOfWeek, startOfMonth } from './time.js';
import * as cloud from './cloud.js';
import { startManager, stopManager } from './manager.js';
import { closeProfile } from './profile.js';
import { startMileage, stopMileage } from './mileage.js';
import { startCalendar, stopCalendar } from './calendar.js';
import { startProjects, stopProjects } from './projects.js';
import { prefs, applyPrefs, showSettings, onProfileName } from './settings.js';
import { refresh as refreshInstall, isInstalled } from './install.js';
import { VERSION_LABEL } from './version.js';

for (const el of document.querySelectorAll('[data-version]')) el.textContent = VERSION_LABEL;

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

// ---------- Швидкий старт: останній стан у пам'яті телефона ----------
// Хто увійшов і останні зміни зберігаються локально, щоб при відкритті одразу показати
// «Мій час», не чекаючи перевірки входу й бази на сервері (вона йде у фоні).
const SESSION_KEY = 'driver-session';
const SHIFTS_CACHE = 'driver-shifts-cache-';

function saveSession(p) {
  try {
    if (p && (p.role === 'driver' || p.role === 'manager')) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ uid: p.uid, name: p.name, email: p.email, role: p.role }));
    } else if (!p) {
      localStorage.removeItem(SESSION_KEY);
      for (const k of Object.keys(localStorage)) if (k.startsWith(SHIFTS_CACHE)) localStorage.removeItem(k);
    }
  } catch { /* сховище недоступне */ }
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function loadCachedShifts(uid) {
  try { return JSON.parse(localStorage.getItem(SHIFTS_CACHE + uid)) || []; } catch { return []; }
}
function cachingSetShifts(uid) {
  return (list) => {
    try { localStorage.setItem(SHIFTS_CACHE + uid, JSON.stringify(list)); } catch { /* немає місця */ }
    setShifts(list);
  };
}

// Поки Firebase запускається: дії водія виконуються одразу на екрані й стають у чергу
function queuedStore() {
  const queued = [];
  return {
    queued,
    put(s) { queued.push(['put', s]); setShifts(shifts.filter((x) => x.id !== s.id).concat(s)); },
    remove(id) { queued.push(['remove', id]); setShifts(shifts.filter((x) => x.id !== id)); },
    stop() {},
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
    if (prefs.confirmEnd && !confirm('Закінчити роботу?')) return;
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

$('exportBtn').addEventListener('click', async () => {
  const { exportMine } = await import('./export.js');
  exportMine(shifts, profile?.name);
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
  document.body.classList.toggle('app-on', view === 'main');
  if (view !== 'main') closeMenu();
  $('loading').hidden = view !== 'loading';
  $('authView').hidden = view !== 'auth';
  $('authHero').hidden = view !== 'auth';
  $('loginInstall').hidden = view !== 'auth' || isInstalled();
  $('loginVer').hidden = view !== 'auth';
  document.body.classList.toggle('auth', view === 'auth');
  $('waitView').hidden = view !== 'wait';
  $('mainView').hidden = view !== 'main';
}

function setTab(tab) {
  for (const b of document.querySelectorAll('.side-nav button')) b.classList.toggle('on', b.dataset.tab === tab);
  $('pageTitle').textContent = { manager: 'Водії', settings: 'Налаштування', mileage: 'Кілометраж', calendar: 'Календар', projects: 'Проєкти' }[tab] || 'Мій час';
  closeMenu();
  closeProfile();
  $('driverView').hidden = tab !== 'driver';
  $('managerView').hidden = tab !== 'manager';
  $('settingsView').hidden = tab !== 'settings';
  $('mileageView').hidden = tab !== 'mileage';
  $('calendarView').hidden = tab !== 'calendar';
  $('projectsView').hidden = tab !== 'projects';
  if (tab === 'calendar') startCalendar(profile); else stopCalendar();
  if (tab === 'projects' && profile?.role === 'manager') startProjects(profile); else stopProjects();
  if (tab === 'mileage') startMileage(profile); else stopMileage();
  if (tab === 'settings') { showSettings(profile); refreshInstall(); }
  if (tab === 'manager') {
    cloud.whenReady().then(() => { if (!$('managerView').hidden) startManager(profile); });
  } else stopManager();
}
for (const b of document.querySelectorAll('.side-nav button')) b.addEventListener('click', () => setTab(b.dataset.tab));

// ---------- Бічне меню (телефон) ----------
function closeMenu() { document.body.classList.remove('menu-open'); }
$('menuBtn').addEventListener('click', () => document.body.classList.add('menu-open'));
$('scrim').addEventListener('click', closeMenu);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

const ROLE_NAMES = { manager: 'Керівник', driver: 'Водій' };
function fillUser(p) {
  $('userName').textContent = p ? p.name : 'Цей пристрій';
  $('sideRole').textContent = p ? (ROLE_NAMES[p.role] || '') : 'Без входу';
  $('sideEmail').textContent = p?.email || '';
  $('sideAvatar').textContent = (p?.name || '•').trim().charAt(0).toUpperCase();
  $('logoutBtn').hidden = !p;
}

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
const EMAIL_KEY = 'driver-last-email';
try {
  const saved = localStorage.getItem(EMAIL_KEY);
  if (saved) $('aEmail').value = saved;
} catch { /* сховище недоступне */ }

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('aEmail').value.trim();
  const pass = $('aPass').value;
  const remember = $('aRemember').checked;
  $('authSubmit').disabled = true;
  $('aErr').textContent = '';
  try {
    await cloud.signIn(email, pass, remember);
    try {
      if (remember) localStorage.setItem(EMAIL_KEY, email);
      else localStorage.removeItem(EMAIL_KEY);
    } catch { /* сховище недоступне */ }
    $('aPass').value = '';
  } catch (err) {
    $('aErr').textContent = cloud.authError(err);
  } finally {
    $('authSubmit').disabled = false;
  }
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
$('waitLogout').addEventListener('click', () => cloud.logout());

// Зміни, записані на цьому пристрої до входу, переносимо в обліковий запис
function offerMigration() {
  const local = loadLocal();
  if (!local.length) return;
  if (!confirm(`На цьому пристрої є ${local.length} змін(и), записаних без входу. Перенести їх у твій обліковий запис?`)) return;
  for (const s of local) store.put({ ...s, id: newId() });
  try { localStorage.removeItem(KEY); } catch { /* немає доступу */ }
}

function onProfile(p) {
  saveSession(p);
  const wasOptimistic = !!profile?.optimistic;
  const sameUser = !!(p && profile && p.uid === profile.uid && p.role === profile.role);

  // Нічого не змінилось (повторний виклик) — лише оновити ім'я
  if (sameUser && !wasOptimistic && !p.error) {
    profile.name = p.name;
    fillUser(profile);
    return;
  }

  // Швидкий старт, але сервер поки недоступний (немає інтернету): лишаємо екран, пишемо в чергу бази
  if (p?.error && wasOptimistic && p.uid === profile.uid) {
    if (store?.queued) {
      const pending = store.queued;
      store = cloudStore(profile, cachingSetShifts(profile.uid));
      for (const [op, arg] of pending) store[op](arg);
    }
    $('modeNote').textContent = 'Немає зв\'язку з сервером: зміни збережено на телефоні, синхронізуються пізніше.';
    return;
  }

  const pending = sameUser ? (store?.queued || []) : [];
  store?.stop();
  if (!sameUser) { stopManager(); stopCalendar(); stopProjects(); }
  profile = p;
  if (!p) {
    store = null;
    shifts = [];
    $('aErr').textContent = '';
    show('auth');
    return;
  }
  fillUser(p);
  if (p.role !== 'driver' && p.role !== 'manager') {
    // Обліковий запис ще не підтверджено керівником або доступ закрито
    store = null;
    shifts = [];
    const off = p.role === 'disabled';
    $('waitTitle').textContent = off ? 'Доступ закрито' : 'Очікує підтвердження';
    $('waitText').textContent = off
      ? 'Керівник закрив доступ для цього облікового запису. Звернися до керівника.'
      : `Обліковий запис ${p.email} ще не підтверджено. Попроси керівника відкрити тобі доступ, потім онови сторінку.`;
    if (p.error) $('waitText').textContent += ' (Немає зв\'язку з базою — перевір інтернет.)';
    show('wait');
    return;
  }
  store = cloudStore(p, cachingSetShifts(p.uid));
  for (const [op, arg] of pending) store[op](arg); // натискання, зроблені під час запуску
  $('navManager').hidden = p.role !== 'manager';
  $('navProjects').hidden = p.role !== 'manager';
  if (!sameUser) setTab('driver');
  show('main');
  updateModeNote();
  if (p.error) showCloudError(p.error);
  if (!sameUser) offerMigration();
}

// ---------- Старт ----------
// Ім'я змінено в налаштуваннях: оновити меню; нові зміни підписуються новим ім'ям
onProfileName((p) => fillUser(p));

async function boot() {
  applyPrefs();
  if (!cloud.cloudEnabled) {
    store = localStore(setShifts);
    fillUser(null);
    setTab('driver');
    show('main');
    updateModeNote();
    return;
  }
  // Швидкий старт: якщо на цьому телефоні вже входили — одразу показуємо «Мій час»
  const cached = loadSession();
  if (cached) {
    profile = { ...cached, optimistic: true };
    fillUser(profile);
    store = queuedStore();
    $('navManager').hidden = cached.role !== 'manager';
    $('navProjects').hidden = cached.role !== 'manager';
    setTab('driver');
    show('main');
    setShifts(loadCachedShifts(cached.uid));
    $('modeNote').textContent = 'Синхронізація…';
  } else {
    show('loading');
  }
  try {
    await cloud.initCloud();
    cloud.onUser(onProfile);
  } catch (e) {
    // SDK не завантажився (напр., перший запуск без інтернету) — працюємо локально
    console.error(e);
    store = localStore(setShifts);
    fillUser(null);
    setTab('driver');
    show('main');
    $('modeNote').textContent = '⚠ Не вдалося підключитися до хмари — дані зберігаються на цьому пристрої.';
  }
}

boot();
setInterval(() => { if (store) renderNow(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && store) render(); });

if ('serviceWorker' in navigator) {
  // Апка відкривається з кешу; коли у фоні завантажилась нова версія — пропонуємо оновити
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) $('updateBar').hidden = false;
  });
  $('updateBtn').addEventListener('click', () => location.reload());
}
