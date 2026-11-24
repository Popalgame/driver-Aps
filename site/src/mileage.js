// Вкладка «Кілометраж»: показник одометра щоранку, заправки, підсумки місяця, історія, Excel.
import * as cloud from './cloud.js';
import { startOfDay, startOfMonth } from './time.js';
import { iconText } from './icons.js';
import { odoRows, summary, previousOdo, dayKey, drivenText } from './mileage-calc.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });

const LOCAL_KEY = 'driver-mileage-v1'; // режим без входу (Firebase не налаштований)
const num = new Intl.NumberFormat('uk-UA');
const num2 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });
const dayFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const dateFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const km = (v) => `${num.format(v)} км`;
const kmDiff = (v) => `${v >= 0 ? '+' : '−'}${km(Math.abs(v))}`;


let user = null;        // { uid, name } або null (локальний режим)
let entries = [];
let stop = null;
let month = startOfMonth(); // вибраний місяць: від нього залежать підсумки, історія й Excel
let editing = null;     // запис у діалозі

// ---------- Сховище ----------
function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch { return []; } }
function saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(entries)); } catch { /* немає місця */ } }

function put(e) {
  if (!user) {
    entries = entries.filter((x) => x.id !== e.id).concat(e);
    saveLocal(); render();
    return;
  }
  // Одразу на екрані; Firebase підтвердить у фоні (працює й без інтернету)
  entries = entries.filter((x) => x.id !== e.id).concat(e);
  render();
  cloud.putMileage(user.uid, e).catch(showError);
}
function remove(id) {
  entries = entries.filter((x) => x.id !== id);
  render();
  if (!user) { saveLocal(); return; }
  cloud.removeMileage(id).catch(showError);
}
function showError(e) {
  console.error(e);
  $('odoMsg').className = 'msg err';
  $('odoMsg').textContent = e?.code === 'permission-denied'
    ? '⚠ Немає доступу до бази. Онови правила Firestore (site/firestore.rules).'
    : '⚠ Помилка збереження: ' + (e?.message || e);
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const odoId = (at) => `odo_${user?.uid || 'local'}_${dayKey(at)}`; // один показник на день

// ---------- Відкрити / закрити вкладку ----------
export function startMileage(profile) {
  stopMileage();
  user = profile ? { uid: profile.uid, name: profile.name } : null;
  if (!user) { entries = loadLocal(); render(); return; }
  entries = [];
  render();
  stop = cloud.watchMileage(user.uid, (list) => { entries = list; render(); }, showError);
}
export function stopMileage() { stop?.(); stop = null; }

// ---------- Кілометраж сьогодні ----------
$('odoForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = Math.round(Number(String($('odoInput').value).replace(/\s/g, '').replace(',', '.')));
  if (!Number.isFinite(v) || v <= 0) { msg('Впиши кілометраж числом, наприклад 184520.', false); return; }
  const today = +startOfDay();
  const prev = previousOdo(entries, today);
  if (prev && v < prev.km && !confirm(`Це менше, ніж попередній запис (${km(prev.km)} за ${dateFmt.format(prev.at)}). Зберегти все одно?`)) return;
  if (prev && v - prev.km > 3000 && !confirm(`Від попереднього запису +${km(v - prev.km)}. Точно правильно?`)) return;
  const existing = entries.find((x) => x.id === odoId(today));
  put({ id: odoId(today), type: 'odo', at: today, km: v, liters: null, amount: null, note: existing?.note || '' });
  msg(`✓ Збережено: ${km(v)}`, true);
});

function msg(t, ok) { $('odoMsg').textContent = t; $('odoMsg').className = 'msg ' + (ok ? 'ok' : 'err'); }

// ---------- Діалог запису (кілометраж за інший день або заправка) ----------
const toLocalInput = (ms, withTime) => {
  const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, withTime ? 16 : 10);
};

function openEntry(e, type) {
  editing = e || null;
  const t = e?.type || type;
  $('kmDlg').dataset.type = t;
  iconText($('kmDlgTitle'), t === 'fuel' ? 'fuel' : 'gauge', t === 'fuel' ? (e ? 'Заправка' : 'Нова заправка') : (e ? 'Кілометраж' : 'Кілометраж за інший день'));
  const fuel = t === 'fuel';
  $('kmDate').type = fuel ? 'datetime-local' : 'date';
  $('kmDate').value = toLocalInput(e?.at ?? (fuel ? Date.now() : +startOfDay()), fuel);
  $('kmDateLabel').firstChild.textContent = fuel ? 'Дата і час ' : 'Дата ';
  $('kmOdoFields').hidden = fuel;
  $('kmMore').hidden = !fuel;
  $('kmKm').value = !fuel ? (e?.km ?? '') : '';
  $('kmNote').value = !fuel ? (e?.note || '') : '';
  $('kmLiters').value = fuel ? (e?.liters ?? '') : '';
  $('kmAmount').value = fuel ? (e?.amount ?? '') : '';
  $('kmFuelKm').value = fuel ? (e?.km ?? '') : '';
  $('kmFuelNote').value = fuel ? (e?.note || '') : '';
  // «Додатково» відкрите лише тоді, коли там уже щось вписано
  $('kmMore').open = !!(fuel && e && (e.liters != null || e.amount != null || e.km != null || e.note));
  $('kmDel').hidden = !e;
  $('kmErr').textContent = '';
  $('kmDlg').showModal();
}

$('fuelAdd').addEventListener('click', () => openEntry(null, 'fuel'));
$('odoOther').addEventListener('click', () => openEntry(null, 'odo'));
$('kmCancel').addEventListener('click', () => $('kmDlg').close());
$('kmDel').addEventListener('click', () => {
  if (editing && confirm('Видалити цей запис?')) { remove(editing.id); $('kmDlg').close(); }
});

$('kmForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const t = $('kmDlg').dataset.type;
  const parse = (id) => { const s = String($(id).value).replace(/\s/g, '').replace(',', '.'); return s === '' ? null : Number(s); };
  const raw = $('kmDate').value;
  if (!raw) { $('kmErr').textContent = 'Вкажи дату.'; return; }
  const at = t === 'fuel' ? +new Date(raw) : +startOfDay(new Date(raw + 'T00:00'));
  const kmV = parse(t === 'fuel' ? 'kmFuelKm' : 'kmKm');
  if (kmV !== null && (!Number.isFinite(kmV) || kmV < 0)) { $('kmErr').textContent = 'Кілометраж — додатне число.'; return; }
  const note = $(t === 'fuel' ? 'kmFuelNote' : 'kmNote').value.trim().slice(0, 200);
  if (t === 'odo') {
    if (kmV === null) { $('kmErr').textContent = 'Впиши кілометраж.'; return; }
    const id = odoId(at);
    if (editing && editing.id !== id) remove(editing.id); // змінили дату — переносимо запис
    put({ id, type: 'odo', at, km: Math.round(kmV), liters: null, amount: null, note });
  } else {
    const liters = parse('kmLiters'), amount = parse('kmAmount');
    // Достатньо дати; літри, сума, кілометраж — за бажанням
    if (liters !== null && !(liters > 0 && liters < 2000)) { $('kmErr').textContent = 'Літри — додатне число.'; $('kmMore').open = true; return; }
    if (amount !== null && !(amount >= 0)) { $('kmErr').textContent = 'Сума — число.'; $('kmMore').open = true; return; }
    put({ id: editing?.id || newId(), type: 'fuel', at, km: kmV === null ? null : Math.round(kmV), liters, amount, note });
  }
  $('kmDlg').close();
});

// ---------- Вибраний місяць і Excel ----------
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
function range() { return [+month, +addMonths(month, 1)]; }
const isCurrent = () => +month === +startOfMonth();

function setMonth(d) {
  const cur = startOfMonth();
  month = +d > +cur ? cur : startOfMonth(d);
  renderStats();
  renderHistory();
}
$('kmPrev').addEventListener('click', () => setMonth(addMonths(month, -1)));
$('kmNext').addEventListener('click', () => setMonth(addMonths(month, 1)));
$('kmMonthSel').addEventListener('change', (e) => setMonth(new Date(Number(e.target.value))));

// Список місяців: від найстаршого запису до поточного
function fillMonthSelect() {
  const sel = $('kmMonthSel');
  const cur = startOfMonth();
  let m = entries.length ? startOfMonth(new Date(Math.min(...entries.map((e) => e.at)))) : cur;
  if (+month < +m) m = new Date(month);
  const opts = [];
  for (; +m <= +cur; m = addMonths(m, 1)) opts.unshift(+m);
  sel.replaceChildren(...opts.map((v) => {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = cap(monthFmt.format(v).replace(/\s*р\.$/, ''));
    return o;
  }));
  sel.value = String(+month);
  $('kmNext').disabled = isCurrent();
}

$('kmExport').addEventListener('click', async () => {
  const { exportMileage } = await import('./export.js');
  const [from, to] = range();
  exportMileage(entries, from, to, user?.name);
});
$('kmExportAll').addEventListener('click', async () => {
  const { exportMileage } = await import('./export.js');
  const first = entries.length ? Math.min(...entries.map((e) => e.at)) : Date.now();
  exportMileage(entries, +startOfDay(new Date(first)), +startOfDay() + 86400000, user?.name);
});

// ---------- Відображення ----------
function render() {
  renderToday();
  renderStats();
  renderHistory();
}

function renderToday() {
  const today = +startOfDay();
  $('odoDate').textContent = cap(dayFmt.format(today));
  const cur = entries.find((e) => e.type === 'odo' && e.at === today);
  const prev = previousOdo(entries, today);
  const input = $('odoInput');
  if (document.activeElement !== input) input.value = cur ? cur.km : '';
  $('odoSave').textContent = cur ? 'Оновити' : 'Зберегти';
  const parts = [];
  if (prev) parts.push(`Попередній запис: ${km(prev.km)} (${dateFmt.format(prev.at)})`);
  if (prev && cur) parts.push(`відтоді проїхано ${kmDiff(cur.km - prev.km)}`);
  if (!prev && !cur) parts.push('Перший запис — впиши, скільки зараз на одометрі.');
  $('odoHint').textContent = parts.join(' · ');
  $('odoDone').hidden = !cur;
}

function renderStats() {
  fillMonthSelect();
  const [from, to] = range();
  const s = summary(entries, from, to);
  const tiles = [
    ['Пробіг', km(s.km)],
    ['Заправок', s.count ? `${s.count}` + (s.liters ? ` · ${num2.format(s.liters)} л` : '') : '0'],
    ['Витрачено', s.amount ? num2.format(s.amount) : '—'],
    ['Середня витрата', s.per100 ? `${num2.format(s.per100)} л/100 км` : '—'],
  ];
  const box = $('kmStats');
  box.replaceChildren();
  for (const [label, v] of tiles) {
    const t = el('div', 'stat');
    t.append(el('span', '', label), el('b', '', v));
    box.append(t);
  }
}

function renderHistory() {
  const [from, to] = range();
  const inP = (e) => e.at >= from && e.at < to;
  const rowsById = new Map(odoRows(entries).map((r) => [r.id, r]));
  const list = entries.filter(inP).sort((a, b) => b.at - a.at || (a.type === 'odo' ? 1 : -1));
  $('kmHistTitle').textContent = `Історія · ${monthFmt.format(month).replace(/ \d{4}.*$/, '')}`;
  $('kmEmpty').textContent = isCurrent()
    ? 'Цього місяця ще немає записів.'
    : `За ${monthFmt.format(month)} записів немає.`;
  const ul = $('kmHistory');
  ul.replaceChildren();
  $('kmEmpty').hidden = list.length > 0;
  let lastDay = null;
  for (const e of list) {
    const d = +startOfDay(new Date(e.at));
    if (d !== lastDay) {
      lastDay = d;
      ul.append(el('li', 'day', cap(dayFmt.format(d))));
    }
    const li = el('li', 'shift km-row ' + e.type);
    const left = el('div');
    const right = el('div', 'd');
    if (e.type === 'odo') {
      left.append(iconText(el('div', 't'), 'gauge', km(e.km)));
      if (e.note) left.append(el('div', 'n', e.note));
      const r = rowsById.get(e.id);
      right.textContent = r?.driven != null ? drivenText(r) : '';
      if (r?.driven == null) right.append(el('span', 'muted small-text', e.at === +startOfDay() ? 'сьогодні' : ''));
    } else {
      left.append(iconText(el('div', 't'), 'fuel', [e.liters != null ? `${num2.format(e.liters)} л` : '', e.amount ? num2.format(e.amount) : ''].filter(Boolean).join(' · ') || 'Заправка'));
      const meta = [timeFmt.format(e.at), e.km != null ? km(e.km) : '', e.amount && e.liters ? `${num2.format(e.amount / e.liters)} за л` : '', e.note].filter(Boolean).join(' · ');
      left.append(el('div', 'n', meta));
    }
    li.append(left, right);
    li.tabIndex = 0;
    li.addEventListener('click', () => openEntry(e));
    li.addEventListener('keydown', (k) => { if (k.key === 'Enter') openEntry(e); });
    ul.append(li);
  }
}
