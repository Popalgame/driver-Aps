// Сторінка водія для керівника: статус наживо, підсумки за періоди, графік тижня, уся історія, Excel.
import { breakMs, workMs, clock, hm, startOfDay, startOfWeek, startOfMonth } from './time.js';
import { driverStats, weekByDay } from './report.js';
import * as cloud from './cloud.js';
import { iconText } from './icons.js';
import * as feed from './feed.js';
import { STATUS, statusText } from './tasks.js';
import { keyToDate, COLORS, peopleText } from './calendar-calc.js';
import { odoRows, summary, drivenText, kmForDriver } from './mileage-calc.js';
import { editedShift, checkShift, LONG_SHIFT } from './shift-edit.js';
import { photoFromFile, setAvatar } from './photo.js';
import { driverCarEl, personalCar, plate, canUse } from './cars.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });

const timeFmt = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
const wdShort = new Intl.DateTimeFormat('uk-UA', { weekday: 'short' });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const hShort = (ms) => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

const HISTORY_STEP = 30;

let uid = null;
let shifts = [];
let stopWatch = null;
let stopKm = null;
let kmEntries = [];
let kmMonth = null;
// Записи всіх водіїв за вибраний місяць (+40 днів): пробіг машини рахується до наступного показника
// цієї машини, навіть якщо його вписав інший водій
let kmAll = [], stopKmAll = null;
function watchKmAll() {
  stopKmAll?.();
  kmAll = [];
  const [from, to] = kmRange();
  stopKmAll = cloud.watchAllMileage(from, to + 40 * 86400000, (list) => { kmAll = list; renderKm(); renderTabs(); }, (e) => console.error(e));
}
// Записи для підрахунку пробігу: усі водії (якщо вже завантажились), інакше — лише цей водій
const kmCalc = () => (kmAll.length ? [...kmAll.filter((e) => e.uid !== uid), ...kmEntries] : kmEntries);
let tick = null;
let weekOffset = 0;   // 0 — цей тиждень, -1 — минулий…
let shown = HISTORY_STEP;
let getUser = () => null;
let setRole = () => {};
let onBack = () => {};
let unsubFeed = null;

export const isOpen = () => uid !== null;

// user — актуальні дані з колекції users (ім'я, email, роль); roleSetter(uid, role, confirmText)
export function openProfile(id, userGetter, roleSetter, back) {
  closeProfile();
  uid = id;
  getUser = userGetter;
  setRole = roleSetter;
  onBack = back;
  weekOffset = 0;
  shown = HISTORY_STEP;
  shifts = [];
  $('profileView').hidden = false;
  setSec(savedSec());
  scrollTo(0, 0);
  render();
  kmEntries = [];
  kmMonth = startOfMonth();
  watchKmAll();
  stopKm = cloud.watchMileage(id, (list) => { kmEntries = list; renderKm(); renderTabs(); renderCar(); }, (e) => console.error(e));
  stopWatch = cloud.watchMyShifts(id, (list) => { shifts = list; render(); }, (e) => {
    console.error(e);
    $('pMeta').textContent = '⚠ Не вдалося завантажити зміни: ' + (e?.message || e);
  });
  tick = setInterval(renderLive, 1000);
  unsubFeed = feed.subscribe((st) => { renderTasks(st); renderCar(); });
}

export function closeProfile() {
  unsubFeed?.(); unsubFeed = null;
  stopWatch?.();
  stopWatch = null;
  stopKm?.();
  stopKm = null;
  stopKmAll?.();
  stopKmAll = null;
  clearInterval(tick);
  uid = null;
  $('profileView').hidden = true;
}

// Дані водія змінились (ім'я, доступ) — перемалювати шапку
export function refreshProfile() { if (uid) renderHead(); }

// Керівник додає / змінює фото водія: натиснув на кружечок
$('pAvatar').addEventListener('click', () => {
  if (user().photo && confirm('Прибрати фото водія? (Скасувати — вибрати нове)')) {
    cloud.setUserPhoto(uid, null).catch((e) => alert('Не вдалося: ' + (e?.message || e)));
    return;
  }
  $('pPhotoFile').click();
});
$('pPhotoFile').addEventListener('change', async () => {
  const f = $('pPhotoFile').files[0];
  $('pPhotoFile').value = '';
  if (!f || !uid) return;
  try {
    const photo = await photoFromFile(f);
    if (!photo) return; // скасовано
    setAvatar($('pAvatar'), user().name, photo);
    await cloud.setUserPhoto(uid, photo);
  } catch (e) {
    alert(e?.code === 'permission-denied' ? 'Немає доступу. Онови апку.' : (e?.message || e));
    renderHead();
  }
});

$('pBack').addEventListener('click', () => { closeProfile(); onBack(); });
$('pPrev').addEventListener('click', () => { weekOffset -= 1; renderWeek(); });
$('pNext').addEventListener('click', () => { if (weekOffset < 0) { weekOffset += 1; renderWeek(); } });
$('pMore').addEventListener('click', () => { shown += 1000; renderHistory(); });
$('pCsv').addEventListener('click', async () => {
  const { exportDriver } = await import('./export.js');
  exportDriver(shifts, user().name);
});
$('pAccess').addEventListener('click', () => {
  const u = user();
  if (u.role === 'disabled') setRole(uid, 'driver');
  else setRole(uid, 'disabled', `Закрити доступ для «${u.name}»? Водій не зможе записувати час. Історія збережеться.`);
});

function user() {
  const u = getUser(uid) || {};
  const fromShift = shifts.find((s) => s.driverName)?.driverName;
  return { name: u.name || fromShift || 'Без імені', email: u.email || '', role: u.role || '', photo: u.photo || null };
}

const active = () => shifts.find((s) => s.end == null);

// ---------- Розділи: «Поправити / додати зміну», «Години роботи», «Кілометраж» ----------
// Відкритий розділ пам'ятає цей пристрій — наступний водій відкривається на тому ж розділі
let sec = null;
const SEC_KEY = 'driver-profile-sec';
function savedSec() {
  try { const v = localStorage.getItem(SEC_KEY); return ['shifts', 'hours', 'km', 'tasks'].includes(v) ? v : null; } catch { return null; }
}
function setSec(v) {
  sec = v;
  try { if (v) localStorage.setItem(SEC_KEY, v); else localStorage.removeItem(SEC_KEY); } catch { /* немає доступу */ }
  for (const b of $('pTabs').querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.sec === v);
    b.setAttribute('aria-expanded', String(b.dataset.sec === v));
  }
  $('pTabs').classList.toggle('picked', !!v);
  for (const n of $('profileView').querySelectorAll('[data-psec]')) n.classList.toggle('sec-off', n.dataset.psec !== v);
}
for (const b of $('pTabs').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    setSec(sec === b.dataset.sec ? null : b.dataset.sec); // повторне натискання — згорнути
    if (sec) $('pTabs').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

// Короткий підсумок на кожній плитці
function renderTabs() {
  const now = Date.now();
  const s = active();
  const st = driverStats(shifts, now);
  const long = s && now - s.start > LONG_SHIFT;
  const fixed = shifts.filter((x) => x.editedBy && x.editedAt >= +startOfMonth()).length;
  $('ptShifts').textContent = long ? `⚠ Зміна йде ${Math.floor((now - s.start) / 3600e3)} год — закінчити?`
    : fixed ? `Виправлено цього місяця: ${fixed}` : 'Забув почати чи закінчити';
  $('ptShifts').classList.toggle('warn', !!long);
  $('ptHours').textContent = `Сьогодні ${hm(st.today)} · місяць ${hm(st.month)}`;
  const m = +startOfMonth();
  const km = kmForDriver(kmCalc(), uid, m, +addMonths(new Date(m), 1));
  const today = +startOfDay();
  const noKm = shifts.some((x) => x.start >= today) && !kmEntries.some((e) => e.type === 'odo' && e.at === today);
  $('ptKm').textContent = noKm ? '⚠ За сьогодні не вписано' : `Цей місяць: ${new Intl.NumberFormat('uk-UA').format(km)} км`;
  $('ptKm').classList.toggle('warn', noKm);
}

function render() {
  if (!uid) return;
  renderTabs();
  renderHead();
  renderLive();
  renderStats();
  renderWeek();
  renderKm();
  renderHistory();
}

function renderHead() {
  const u = user();
  $('pageTitle').textContent = u.name;
  $('pName').textContent = u.name;
  $('pEmail').textContent = u.email;
  setAvatar($('pAvatar'), u.name, u.photo);
  const off = u.role === 'disabled';
  $('pAccess').hidden = !(u.role === 'driver' || off);
  $('pAccess').textContent = off ? 'Відкрити доступ' : 'Закрити доступ';
  $('pAccess').className = 'btn small ' + (off ? 'start' : 'danger');
  $('profileView').classList.toggle('off', off);
  renderCar();
}

// Машина водія: на якій сьогодні / востаннє / закріплена
function renderCar() {
  const u = uid ? getUser(uid) : null;
  const n = uid ? driverCarEl(uid, kmEntries.map((e) => ({ ...e, uid })), false, personalCar(uid, u?.myCar)) : null;
  $('pCar').replaceChildren(...(n ? [n] : []));
  renderCarAccess(u);
}

// Працівник: до яких машин фірми є доступ (керівник натискає номер — дати / забрати)
function renderCarAccess(u) {
  const box = $('pCarAccess');
  const cars = feed.state.cars;
  box.hidden = u?.kind !== 'emp' || !cars.length;
  if (box.hidden) return;
  const chips = cars.slice().sort((a, b) => a.plate.localeCompare(b.plate)).map((c) => {
    const on = canUse(c, uid);
    const b = el('button', 'acc-chip' + (on ? ' on' : ''));
    b.type = 'button';
    b.title = on ? 'Забрати доступ' : 'Дати доступ';
    b.append(plate(c.plate), el('span', 'acc-mark', on ? '✓' : '+'));
    b.disabled = c.driver === uid; // закріплену машину — у «Машинах»
    b.addEventListener('click', () => {
      const access = new Set(c.access || []);
      if (access.has(uid)) access.delete(uid); else access.add(uid);
      cloud.patchCar(c.id, { access: [...access] }).catch((e) => alert(e?.code === 'permission-denied' ? 'Немає доступу. Онови апку.' : 'Не вдалося: ' + (e?.message || e)));
    });
    return b;
  });
  box.replaceChildren(el('div', 'muted small-text', 'Доступ до машин фірми (натисни номер):'), Object.assign(el('div', 'acc-chips'), {}));
  box.lastChild.append(...chips);
}

function renderLive() {
  if (!uid) return;
  const u = user();
  const s = active();
  const now = Date.now();
  const st = $('pStatus');
  if (u.role === 'disabled') {
    st.textContent = 'Доступ закрито'; st.className = 'badge off';
  } else if (s) {
    const paused = s.breaks.some((b) => b.end == null);
    if (paused) iconText(st, 'coffee', 'Перерва'); else st.textContent = '● У дорозі';
    st.className = 'badge ' + (paused ? 'pause' : 'on');
  } else {
    st.textContent = 'Не на зміні'; st.className = 'badge';
  }
  if (s) {
    $('pTimer').textContent = clock(workMs(s, now));
    $('pFixActive').classList.toggle('warn', now - s.start > LONG_SHIFT);
    const b = breakMs(s, now);
    $('pTimerSub').textContent = `зміна з ${timeFmt.format(s.start)}` + (b >= 60000 ? ` · перерви ${hm(b)}` : '') + (s.note ? ` · ${s.note}` : '');
  } else {
    const last = shifts.filter((x) => x.end != null).sort((a, b2) => b2.start - a.start)[0];
    $('pTimer').textContent = '—';
    $('pTimerSub').textContent = last ? `остання зміна: ${shortDate.format(last.start)}, ${hm(workMs(last))}` : 'ще не було змін';
  }
  $('pFixActive').hidden = !s;
  // Підсумки «сьогодні / тиждень» змінюються щохвилини, поки водій на зміні
  if (s && new Date(now).getSeconds() === 0) { renderStats(); renderWeek(); }
}

function renderStats() {
  const now = Date.now();
  const st = driverStats(shifts, now);
  const tiles = [
    ['Сьогодні', st.today],
    ['Цей тиждень', st.week],
    ['Минулий тиждень', st.lastWeek],
    ['Цей місяць', st.month],
    ['Минулий місяць', st.lastMonth],
    ['Увесь час', st.all],
  ];
  const box = $('pStats');
  box.replaceChildren();
  for (const [label, ms] of tiles) {
    const t = el('div', 'stat');
    t.append(el('span', '', label), el('b', '', hm(ms)));
    box.append(t);
  }
  const parts = [
    `змін цього місяця: ${st.shiftsMonth}`,
    `усього змін: ${st.shiftsAll}`,
    st.avgShift ? `середня зміна: ${hm(st.avgShift)}` : '',
    st.breaksMonth >= 60000 ? `перерви за місяць: ${hm(st.breaksMonth)}` : '',
    st.firstShift ? `перша зміна: ${longDate.format(st.firstShift)}` : '',
  ].filter(Boolean);
  $('pMeta').textContent = parts.join(' · ');
}

function renderWeek() {
  const now = Date.now();
  const start = startOfWeek(new Date(now));
  start.setDate(start.getDate() + weekOffset * 7);
  const days = weekByDay(shifts, start, now);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  $('pWeekLabel').textContent = weekOffset === 0 ? 'Цей тиждень'
    : weekOffset === -1 ? 'Минулий тиждень'
      : `${shortDate.format(start)} – ${shortDate.format(end)}`;
  $('pNext').disabled = weekOffset >= 0;
  const total = days.reduce((a, d) => a + d.ms, 0);
  $('pWeekTotal').textContent = `Разом за тиждень: ${hm(total)} · ${shortDate.format(start)} – ${longDate.format(end)}`;

  // Шкала: повна доба — 24 години
  const maxH = 24;
  const chart = $('pChart');
  chart.replaceChildren();
  chart.setAttribute('aria-label', 'Години по днях: ' + days.map((d) => `${wdShort.format(d.start)} ${hm(d.ms)}`).join(', '));
  const grid = el('div', 'c-grid');
  for (const h of [24, 18, 12, 6, 0]) {
    const line = el('div', 'c-line');
    line.append(el('span', 'c-y', `${h} год`));
    grid.append(line);
  }
  const cols = el('div', 'c-cols');
  const today = +startOfDay(new Date(now));
  for (const d of days) {
    const col = el('div', 'c-col' + (d.start === today ? ' today' : '') + (d.start > now ? ' future' : ''));
    const track = el('div', 'c-track');
    const bar = el('div', 'c-bar');
    const pct = Math.min(100, (d.ms / (maxH * 3600e3)) * 100);
    bar.style.height = d.ms > 0 ? `max(3px, ${pct}%)` : '0';
    track.append(bar);
    const tip = `${cap(dayFmt.format(d.start))}: ${hm(d.ms)}`;
    col.title = tip;
    col.tabIndex = 0;
    col.dataset.tip = tip;
    col.append(track, el('div', 'c-x', cap(wdShort.format(d.start))), el('div', 'c-v', d.ms ? hShort(d.ms) : '—'));
    cols.append(col);
  }
  chart.append(grid, cols, el('div', 'c-tip'));
}

// Підказка над стовпчиком: наведення мишкою або дотик
function showTip(col) {
  const tip = $('pChart').querySelector('.c-tip');
  if (!col || !tip) { if (tip) tip.classList.remove('on'); return; }
  tip.textContent = col.dataset.tip;
  const c = $('pChart').getBoundingClientRect(), r = col.getBoundingClientRect();
  tip.style.left = `${Math.min(Math.max(r.left - c.left + r.width / 2, 70), c.width - 70)}px`;
  tip.classList.add('on');
}
$('pChart').addEventListener('pointerover', (e) => showTip(e.target.closest('.c-col')));
$('pChart').addEventListener('pointerleave', () => showTip(null));
$('pChart').addEventListener('focusin', (e) => showTip(e.target.closest('.c-col')));
$('pChart').addEventListener('focusout', () => showTip(null));

function renderHistory() {
  const now = Date.now();
  const list = $('pHistory');
  list.replaceChildren();
  const sorted = [...shifts].sort((a, b) => b.start - a.start);
  $('pCount').textContent = sorted.length ? `${sorted.length} змін(и)` : '';
  $('pEmptyHist').hidden = sorted.length > 0;
  const part = sorted.slice(0, shown);
  $('pMore').hidden = sorted.length <= shown;
  $('pMore').textContent = `Показати всі (${sorted.length})`;
  const groups = new Map();
  for (const s of part) {
    const k = +startOfDay(new Date(s.start));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  for (const [day, items] of groups) {
    const h = el('li', 'day');
    h.append(el('span', '', cap(dayFmt.format(day))), el('span', '', hm(items.reduce((a, s) => a + workMs(s, now), 0))));
    list.append(h);
    for (const s of items) {
      const li = el('li', 'shift' + (s.end == null && now - s.start > LONG_SHIFT ? ' long' : ''));
      const left = el('div');
      left.append(el('div', 't', `${timeFmt.format(s.start)} – ${s.end == null ? 'зараз' : timeFmt.format(s.end)}`));
      const b = breakMs(s, now);
      const meta = [b >= 60000 ? `перерви ${hm(b)}` : '', s.note].filter(Boolean).join(' · ');
      if (meta) left.append(el('div', 'n', meta));
      if (s.editedBy) left.append(editedMark(s));
      li.append(left, el('div', 'd', hm(workMs(s, now))));
      li.tabIndex = 0;
      li.addEventListener('click', () => openShift(s));
      li.addEventListener('keydown', (k) => { if (k.key === 'Enter') openShift(s); });
      list.append(li);
    }
  }
}

// ---------- Кілометраж водія ----------
const kmNum = new Intl.NumberFormat('uk-UA');
const kmNum2 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });
const monthFmt = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' });
const rowDay = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const kmRange = () => [+kmMonth, +addMonths(kmMonth, 1)];

// Завдання водія: що зараз у роботі і що виконав (останні 20); підсумок за місяць
const tDate = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
const tDone = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function renderTasks(st) {
  if (!uid) return;
  const mine = st.events.filter((e) => e.need && e.driver === uid);
  const month = +startOfMonth();
  const doneMonth = mine.filter((e) => e.status === 'done' && e.doneAt >= month).length;
  const doneAll = mine.filter((e) => e.status === 'done').length;
  const now = mine.find((e) => e.status === 'onway') || mine.find((e) => e.status === 'taken');
  $('ptTasks').textContent = now ? `${now.status === 'onway' ? 'Зараз в дорозі' : 'Взяв'}: «${now.title}»`
    : mine.length ? `Виконано цього місяця: ${doneMonth}` : 'Ще не брав завдань';
  $('pTasksEmpty').hidden = mine.length > 0;
  $('pTasksSum').textContent = '';
  $('pTasksList').replaceChildren();
  if (!mine.length) return;
  $('pTasksSum').textContent = `виконано цього місяця: ${doneMonth} · усього: ${doneAll}`;
  const order = { onway: 0, taken: 1, done: 2 };
  const list = mine.sort((a, b) => (order[a.status] - order[b.status]) || (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).slice(0, 20);
  $('pTasksList').replaceChildren(...list.map((e) => {
    const p = st.projects.find((x) => x.id === e.project);
    const li = el('li', 'cal-ev');
    li.style.setProperty('--c', COLORS[p?.color ?? 0]);
    const top = el('div', 'ev-top');
    top.append(el('span', 'ev-date', tDate.format(keyToDate(e.date))));
    if (e.time) top.append(el('span', 'ev-time', e.time));
    top.append(el('b', 'ev-what', e.title));
    li.append(top);
    li.append(el('div', 'ev-meta', [e.people ? peopleText(e.people) : '', p?.name, e.byName ? 'від ' + e.byName : ''].filter(Boolean).join(' · ')));
    const bar = el('div', 'task-bar');
    const s = e.status || 'open';
    bar.append(iconText(el('span', 'task-st ' + STATUS[s].cls), STATUS[s].icon, s === 'done' ? `Виконано ${tDone.format(e.doneAt)}` : statusText(e).split(':')[0]));
    li.append(bar);
    return li;
  }));
}

function setKmMonth(d) {
  const cur = startOfMonth();
  kmMonth = +d > +cur ? cur : startOfMonth(d);
  watchKmAll();
  renderKm();
}
$('pkPrev').addEventListener('click', () => setKmMonth(addMonths(kmMonth, -1)));
$('pkNext').addEventListener('click', () => setKmMonth(addMonths(kmMonth, 1)));
$('pkMonthSel').addEventListener('change', (e) => setKmMonth(new Date(Number(e.target.value))));
$('pkExport').addEventListener('click', async () => {
  const { exportMileage } = await import('./export.js');
  const [from, to] = kmRange();
  exportMileage(kmEntries, from, to, user().name);
});

function renderKm() {
  if (!uid || !kmMonth) return;
  const cur = startOfMonth();
  // список місяців: від першого запису водія до поточного
  let m = kmEntries.length ? startOfMonth(new Date(Math.min(...kmEntries.map((e) => e.at)))) : cur;
  if (+kmMonth < +m) m = new Date(kmMonth);
  const opts = [];
  for (; +m <= +cur; m = addMonths(m, 1)) opts.unshift(+m);
  $('pkMonthSel').replaceChildren(...opts.map((v) => Object.assign(document.createElement('option'),
    { value: String(v), textContent: cap(monthFmt.format(v).replace(/\s*р\.$/, '')) })));
  $('pkMonthSel').value = String(+kmMonth);
  $('pkNext').disabled = +kmMonth === +cur;

  const [from, to] = kmRange();
  const s = summary(kmEntries, from, to);
  s.km = kmForDriver(kmCalc(), uid, from, to);
  if (s.km > 0 && s.liters > 0) s.per100 = (s.liters / s.km) * 100;
  const box = $('pkStats');
  box.replaceChildren();
  for (const [label, v] of [
    ['Пробіг', `${kmNum.format(s.km)} км`],
    ['Заправок', s.count ? `${s.count}` + (s.liters ? ` · ${kmNum2.format(s.liters)} л` : '') : '0'],
    ['Витрачено', s.amount ? kmNum2.format(s.amount) : '—'],
    ['Середня витрата', s.per100 ? `${kmNum2.format(s.per100)} л/100 км` : '—'],
  ]) {
    const t = el('div', 'stat');
    t.append(el('span', '', label), el('b', '', v));
    box.append(t);
  }

  // Кожен день місяця (до сьогодні), найновіші зверху; пропущені дні видно
  const rows = new Map(odoRows(kmCalc()).filter((r) => r.uid === uid).map((r) => [r.at, r]));
  const today = +startOfDay();
  const body = $('pkRows');
  body.replaceChildren();
  $('pkEmpty').hidden = kmEntries.some((e) => e.type === 'odo');
  // Дні — від першого запису водія (порожні дні до нього не показуємо); пропуски між записами видно
  const odoAts = kmEntries.filter((e) => e.type === 'odo').map((e) => e.at);
  const firstOdo = odoAts.length ? Math.min(...odoAts) : Infinity;
  const lastDay = Math.min(to - 1, today);
  for (let d = +startOfDay(new Date(lastDay)); d >= Math.max(from, firstOdo); d = +startOfDay(new Date(d - 12 * 3600e3))) {
    const r = rows.get(d);
    const tr = el('tr', (r ? '' : 'miss') + ([0, 6].includes(new Date(d).getDay()) ? ' weekend' : ''));
    let drv = '';
    if (r) drv = r.driven != null ? `${r.driven >= 0 ? '+' : '−'}${kmNum.format(Math.abs(r.driven))}${r.span > 1 ? ` (${r.span} дн.)` : ''}` : (d === today ? 'сьогодні' : '—');
    const kmCell = el('td', '', r ? kmNum.format(r.km) : '—');
    if (r?.plate) kmCell.append(el('small', 'pk-plate', r.plate)); // на якій машині
    tr.append(el('td', '', cap(rowDay.format(d))), kmCell, el('td', 'drv', drv));
    if (r?.span > 1) tr.title = drivenText(r);
    body.append(tr);
  }
  const foot = document.createElement('tfoot');
  const ft = el('tr');
  ft.append(el('td', '', 'Разом'), el('td', ''), el('td', 'drv', kmNum.format(s.km)));
  foot.append(ft);
  body.parentElement.querySelector('tfoot')?.remove();
  body.parentElement.append(foot);

  const fuel = kmEntries.filter((e) => e.type === 'fuel' && e.at >= from && e.at < to).sort((a, b) => b.at - a.at);
  $('pkFuelBox').hidden = !fuel.length;
  const ul = $('pkFuel');
  ul.replaceChildren();
  for (const e of fuel) {
    const li = el('li', 'shift static km-row fuel');
    const left = el('div');
    left.append(iconText(el('div', 't'), 'fuel', [e.liters != null ? `${kmNum2.format(e.liters)} л` : '', e.amount ? kmNum2.format(e.amount) : ''].filter(Boolean).join(' · ') || 'Заправка'));
    left.append(el('div', 'n', [shortDate.format(e.at), timeFmt.format(e.at), e.km != null ? `${kmNum.format(e.km)} км` : '', e.amount && e.liters ? `${kmNum2.format(e.amount / e.liters)} за л` : '', e.note].filter(Boolean).join(' · ')));
    li.append(left);
    ul.append(li);
  }
}

// ---------- Керівник виправляє зміну (забув «Почати» / «Закінчити») ----------
let editingShift = null;
const toLocal = (ms) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fromLocal = (v) => (v ? new Date(v).getTime() : NaN);

export function editedMark(s) {
  return iconText(el('div', 'n edited ih'), 'pencil', `Виправлено керівником (${s.editedByName || '—'}) · ${shortDate.format(s.editedAt)}, ${timeFmt.format(s.editedAt)}`);
}

function openShift(s) {
  editingShift = s || null;
  const now = Date.now();
  const open = !!s && s.end == null;
  iconText($('msTitle'), s ? 'pencil' : 'plus', s ? 'Виправити зміну' : 'Додати зміну');
  $('msWho').textContent = user().name;
  $('msActive').hidden = !open;
  $('msOpenLabel').hidden = !open;
  $('msOpen').checked = false;
  $('msEndLabel').hidden = false;
  // Нова зміна: за замовчуванням сьогодні 08:00 – 17:00 (або до «зараз»)
  const d8 = new Date(); d8.setHours(8, 0, 0, 0);
  const start = s ? s.start : Math.min(+d8, now - 3600e3);
  const end = s ? (s.end ?? now) : Math.min(+d8 + 9 * 3600e3, now);
  $('msStart').value = toLocal(start);
  $('msEnd').value = toLocal(end);
  $('msStart').max = $('msEnd').max = toLocal(now);
  $('msBreak').value = s ? Math.round(breakMs(s, now) / 60000) : 0;
  $('msNote').value = s?.note || '';
  $('msEdited').textContent = s?.editedBy ? `Уже виправляв(ла) ${s.editedByName || 'керівник'}: ${longDate.format(s.editedAt)}, ${timeFmt.format(s.editedAt)}` : '';
  $('msDel').hidden = !s;
  $('msErr').textContent = '';
  $('msDlg').showModal();
}

$('pAddShift').addEventListener('click', () => openShift(null));
$('pFixActive').addEventListener('click', () => { const s = active(); if (s) openShift(s); });
$('msCancel').addEventListener('click', () => $('msDlg').close());
$('msOpen').addEventListener('change', () => { $('msEndLabel').hidden = $('msOpen').checked; });
$('msDel').addEventListener('click', () => {
  if (!editingShift) return;
  if (!confirm(`Видалити цю зміну водія ${user().name}? Це не можна скасувати.`)) return;
  cloud.removeShift(editingShift.id).catch(showErr);
  $('msDlg').close();
});

function showErr(e) {
  console.error(e);
  alert(e?.code === 'permission-denied'
    ? 'Немає доступу. Онови правила Firestore у Firebase Console.'
    : 'Не вдалося зберегти: ' + (e?.message || e));
}

$('msForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const now = Date.now();
  const f = {
    start: fromLocal($('msStart').value),
    end: $('msOpen').checked ? null : fromLocal($('msEnd').value),
    breakMin: Math.max(0, Number($('msBreak').value) || 0),
    note: $('msNote').value,
  };
  if (f.end !== null && !Number.isFinite(f.end)) { $('msErr').textContent = 'Вкажи кінець.'; return; }
  const others = shifts.filter((x) => x.id !== editingShift?.id);
  const { err, warn } = checkShift(f, others, now);
  if (err.length) { $('msErr').textContent = err[0]; return; }
  if (warn.length && !confirm(warn.join(' ') + ' Зберегти все одно?')) return;
  const me = feed.state.user || {};
  const base = editingShift || { id: crypto.randomUUID ? crypto.randomUUID() : 'm' + now.toString(36), uid, driverName: user().name.slice(0, 60) };
  cloud.putShift(editedShift(base, f, { uid: me.uid, name: me.name }, now)).catch(showErr);
  $('msDlg').close();
});
