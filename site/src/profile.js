// Сторінка водія для керівника: статус наживо, підсумки за періоди, графік тижня, уся історія, CSV.
import { breakMs, workMs, clock, hm, startOfDay, startOfWeek } from './time.js';
import { driverStats, weekByDay, shiftsToCsv, downloadCsv } from './report.js';
import * as cloud from './cloud.js';

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

// Назва файлу латиницею: кирилиця в імені завантаження ламається в деяких браузерах
const TR = { а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ie',ж:'zh',з:'z',и:'y',і:'i',ї:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'iu',я:'ia',ё:'e',ы:'y',э:'e',ъ:'' };
const latin = (t) => [...t].map((ch) => {
  const lo = ch.toLowerCase(), r = TR[lo];
  if (r === undefined) return ch;
  return ch === lo ? r : r.charAt(0).toUpperCase() + r.slice(1);
}).join('');

let uid = null;
let shifts = [];
let stopWatch = null;
let tick = null;
let weekOffset = 0;   // 0 — цей тиждень, -1 — минулий…
let shown = HISTORY_STEP;
let getUser = () => null;
let setRole = () => {};
let onBack = () => {};

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
  scrollTo(0, 0);
  render();
  stopWatch = cloud.watchMyShifts(id, (list) => { shifts = list; render(); }, (e) => {
    console.error(e);
    $('pMeta').textContent = '⚠ Не вдалося завантажити зміни: ' + (e?.message || e);
  });
  tick = setInterval(renderLive, 1000);
}

export function closeProfile() {
  stopWatch?.();
  stopWatch = null;
  clearInterval(tick);
  uid = null;
  $('profileView').hidden = true;
}

// Дані водія змінились (ім'я, доступ) — перемалювати шапку
export function refreshProfile() { if (uid) renderHead(); }

$('pBack').addEventListener('click', () => { closeProfile(); onBack(); });
$('pPrev').addEventListener('click', () => { weekOffset -= 1; renderWeek(); });
$('pNext').addEventListener('click', () => { if (weekOffset < 0) { weekOffset += 1; renderWeek(); } });
$('pMore').addEventListener('click', () => { shown += 1000; renderHistory(); });
$('pCsv').addEventListener('click', () => {
  const u = user();
  const base = latin(u.name || 'vodii').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vodii';
  const file = `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCsv(shiftsToCsv(shifts, new Map([[uid, u.name]])), file);
});
$('pAccess').addEventListener('click', () => {
  const u = user();
  if (u.role === 'disabled') setRole(uid, 'driver');
  else setRole(uid, 'disabled', `Закрити доступ для «${u.name}»? Водій не зможе записувати час. Історія збережеться.`);
});

function user() {
  const u = getUser(uid) || {};
  const fromShift = shifts.find((s) => s.driverName)?.driverName;
  return { name: u.name || fromShift || 'Без імені', email: u.email || '', role: u.role || '' };
}

const active = () => shifts.find((s) => s.end == null);

function render() {
  if (!uid) return;
  renderHead();
  renderLive();
  renderStats();
  renderWeek();
  renderHistory();
}

function renderHead() {
  const u = user();
  $('pageTitle').textContent = u.name;
  $('pName').textContent = u.name;
  $('pEmail').textContent = u.email;
  $('pAvatar').textContent = u.name.trim().charAt(0).toUpperCase() || '•';
  const off = u.role === 'disabled';
  $('pAccess').hidden = !(u.role === 'driver' || off);
  $('pAccess').textContent = off ? 'Відкрити доступ' : 'Закрити доступ';
  $('pAccess').className = 'btn small ' + (off ? 'start' : 'danger');
  $('profileView').classList.toggle('off', off);
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
    st.textContent = paused ? '☕ Перерва' : '● У дорозі';
    st.className = 'badge ' + (paused ? 'pause' : 'on');
  } else {
    st.textContent = 'Не на зміні'; st.className = 'badge';
  }
  if (s) {
    $('pTimer').textContent = clock(workMs(s, now));
    const b = breakMs(s, now);
    $('pTimerSub').textContent = `зміна з ${timeFmt.format(s.start)}` + (b >= 60000 ? ` · перерви ${hm(b)}` : '') + (s.note ? ` · ${s.note}` : '');
  } else {
    const last = shifts.filter((x) => x.end != null).sort((a, b2) => b2.start - a.start)[0];
    $('pTimer').textContent = '—';
    $('pTimerSub').textContent = last ? `остання зміна: ${shortDate.format(last.start)}, ${hm(workMs(last))}` : 'ще не було змін';
  }
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

  // Шкала: цілі години, щонайменше 8
  const maxH = Math.max(8, Math.ceil(Math.max(...days.map((d) => d.ms)) / 3600e3));
  const chart = $('pChart');
  chart.replaceChildren();
  chart.setAttribute('aria-label', 'Години по днях: ' + days.map((d) => `${wdShort.format(d.start)} ${hm(d.ms)}`).join(', '));
  const grid = el('div', 'c-grid');
  for (const h of [maxH, Math.round(maxH / 2), 0]) {
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
      const li = el('li', 'shift static');
      const left = el('div');
      left.append(el('div', 't', `${timeFmt.format(s.start)} – ${s.end == null ? 'зараз' : timeFmt.format(s.end)}`));
      const b = breakMs(s, now);
      const meta = [b >= 60000 ? `перерви ${hm(b)}` : '', s.note].filter(Boolean).join(' · ');
      if (meta) left.append(el('div', 'n', meta));
      li.append(left, el('div', 'd', hm(workMs(s, now))));
      list.append(li);
    }
  }
}
