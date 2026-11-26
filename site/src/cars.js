// Вкладка «Машини» (керівник) і картка «Моя машина» у водія (вкладка «Кілометраж»).
// Номер, модель, хто їздить, страховка, техогляд, наступне ТО — з нагадуваннями.
import * as cloud from './cloud.js';
import * as feed from './feed.js';
import { carKm } from './car-calc.js';
import { avatarEl } from './photo.js';
import { iconText } from './icons.js';
import { COLORS } from './calendar-calc.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const num = new Intl.NumberFormat('uk-UA');
const shortFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' });
const DAY = 86400000;

let st = feed.state, unsub = null, stopKm = null, kmEntries = [], editing = null;
let filter = ''; // '' — усі, pid — проєкт, '-' — без проєкту

const drivers = () => st.users.filter((u) => u.role === 'driver' && u.kind !== 'hr').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'));
const kmOf = (c) => carKm(kmEntries, c);

function showError(e) {
  console.error(e);
  $('carErr').textContent = e?.code === 'permission-denied'
    ? '⚠ Немає доступу. Онови апку (правила бази оновлюються разом з нею).'
    : '⚠ Помилка: ' + (e?.message || e);
}

// ---------- Керівник: вкладка «Машини» ----------
export function startCars() {
  stopCars();
  $('carErr').textContent = '';
  // Пробіг: останні показники водіїв за 120 днів
  stopKm = cloud.watchAllMileage(Date.now() - 120 * DAY, Date.now() + DAY, (list) => { kmEntries = list; render(); }, (e) => console.error(e));
  unsub = feed.subscribe((s) => { st = s; render(); });
}
export function stopCars() {
  unsub?.(); unsub = null;
  stopKm?.(); stopKm = null;
  if ($('carDlg').open) $('carDlg').close();
}

// Номерний знак (білий, із синьою смужкою PL)
export function plate(text) {
  const p = el('span', 'plate');
  p.append(el('span', 'plate-ua', 'PL'), el('b', '', text));
  return p;
}

const projOf = (c) => (c.project ? st.projects.find((p) => p.id === c.project) : null);

// Фільтр угорі: Усі · Струмет · Млешна · Без проєкту
function renderFilter() {
  const box = $('carFilter');
  const used = new Set(st.cars.map((c) => c.project || '-'));
  const chip = (id, name, color, n) => {
    const b = el('button', 'chip' + (filter === id ? ' on' : ''));
    b.type = 'button';
    if (color) { const dot = el('span', 'dot'); dot.style.background = color; b.append(dot); }
    b.append(name + (n != null ? ` · ${n}` : ''));
    b.addEventListener('click', () => { filter = id; render(); });
    return b;
  };
  const chips = [chip('', 'Усі', null, st.cars.length)];
  for (const p of st.projects) if (used.has(p.id)) chips.push(chip(p.id, p.name, COLORS[p.color] || COLORS[0], st.cars.filter((c) => c.project === p.id).length));
  if (used.has('-') && used.size > 1) chips.push(chip('-', 'Без проєкту', null, st.cars.filter((c) => !c.project).length));
  box.replaceChildren(...chips);
  box.hidden = st.cars.length < 2 || used.size < 2;
  if (box.hidden) filter = '';
}

function render() {
  if ($('carsView').hidden) return;
  renderFilter();
  const cars = st.cars
    .filter((c) => !filter || (filter === '-' ? !c.project : c.project === filter))
    .sort((a, b) => a.plate.localeCompare(b.plate, 'uk'));
  $('carEmpty').hidden = st.cars.length > 0;
  $('carList').replaceChildren(...cars.map((c) => {
    const k = kmOf(c);
    const li = el('li', 'card car');
    const pr = projOf(c);
    if (pr) li.style.setProperty('--c', COLORS[pr.color] || COLORS[0]);
    li.tabIndex = 0;
    const head = el('div', 'car-head');
    head.append(plate(c.plate), el('b', 'car-model', c.model || ''));
    const p = projOf(c);
    if (p) {
      const tag = el('span', 'car-proj');
      tag.style.setProperty('--c', COLORS[p.color] || COLORS[0]);
      tag.append(el('span', 'dot'), p.name);
      head.append(tag);
    }
    li.append(head);
    const who = el('div', 'car-who');
    if (c.driver) {
      const u = st.users.find((x) => x.id === c.driver);
      who.append(avatarEl(u?.name || c.driverName, u?.photo, 'sm'), el('span', '', u?.name || c.driverName || '…'));
    } else who.append(el('span', 'muted', 'Водія не закріплено'));
    if (k) {
      const by = st.users.find((x) => x.id === k.uid)?.name;
      const km = el('span', 'car-km', `${num.format(k.km)} км`);
      km.title = `Вписано ${shortFmt.format(k.at)}${by ? ' · ' + by : ''}`;
      who.append(km);
    }
    li.append(who);
    if (c.note) li.append(el('p', 'muted small-text car-note', c.note));
    li.addEventListener('click', () => openCar(c));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') openCar(c); });
    return li;
  }));
}

function openCar(c) {
  editing = c || null;
  iconText($('carTitle'), 'car', c ? `Машина ${c.plate}` : 'Нова машина');
  $('carPlate').value = c?.plate || '';
  $('carModel').value = c?.model || '';
  const sel = $('carDriver');
  sel.replaceChildren(Object.assign(el('option', '', '— без водія —'), { value: '' }),
    ...drivers().map((u) => Object.assign(el('option', '', u.name || u.email), { value: u.id })));
  sel.value = c?.driver || '';
  const ps = $('carProject');
  ps.replaceChildren(Object.assign(el('option', '', '— без проєкту —'), { value: '' }),
    ...st.projects.map((p) => Object.assign(el('option', '', p.name), { value: p.id })));
  // Нова машина з відкритим фільтром проєкту — одразу в цей проєкт
  ps.value = c ? (c.project || '') : (filter && filter !== '-' ? filter : '');
  $('carNote').value = c?.note || '';
  renderKmNow();
  $('carDel').hidden = !c;
  $('carErrDlg').textContent = '';
  $('carDlg').showModal();
  if (!c) $('carPlate').focus();
}

function renderKmNow() {
  const k = editing ? carKm(kmEntries, { ...editing, driver: $('carDriver').value || null }) : null;
  const by = k && st.users.find((x) => x.id === k.uid)?.name;
  $('carKmNow').textContent = k ? `Зараз на одометрі: ${num.format(k.km)} км (${shortFmt.format(k.at)}${by ? ', вписав ' + by : ''})` : '';
}
$('carDriver').addEventListener('change', () => {
  renderKmNow();
  const d = $('carDriver').value;
  const p = d && st.projects.filter((x) => (x.members || []).includes(d));
  if (!$('carProject').value && p?.length === 1) $('carProject').value = p[0].id;
});
$('carAdd').addEventListener('click', () => openCar(null));
$('carCancel').addEventListener('click', () => $('carDlg').close());
$('carDel').addEventListener('click', () => {
  if (!editing || !confirm(`Видалити машину ${editing.plate}?`)) return;
  cloud.removeCar(editing.id).catch(showError);
  $('carDlg').close();
});

$('carForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = (t) => { $('carErrDlg').textContent = t; };
  const plateV = $('carPlate').value.toUpperCase().replace(/\s+/g, '');
  if (!plateV) return err('Впиши номер машини.');
  if (st.cars.some((c) => c.id !== editing?.id && c.plate === plateV)) return err('Машина з таким номером уже є.');
  const driver = $('carDriver').value || null;
  // Одна машина — один водій: якщо водій уже на іншій машині, попереджаємо
  const other = driver && st.cars.find((c) => c.id !== editing?.id && c.driver === driver);
  if (other && !confirm(`Цей водій уже закріплений за ${other.plate}. Закріпити і за цією?`)) return;
  const u = st.users.find((x) => x.id === driver);
  cloud.putCar({
    id: editing?.id || newId(),
    plate: plateV,
    model: $('carModel').value.trim().slice(0, 40),
    driver, driverName: (u?.name || '').slice(0, 60),
    project: $('carProject').value || null,
    note: $('carNote').value.trim().slice(0, 200),
    createdAt: editing?.createdAt || Date.now(),
  }).catch(showError);
  $('carDlg').close();
});

// ---------- Вибір машини, на якій водій їде (кілометраж зранку) ----------
// Свої (закріплені) і звична — першими. onPick(id) — натиснув номер.
export function carChips(box, selected, uid, onPick) {
  const cars = [...feed.state.cars].sort((a, b) => (b.id === selected) - (a.id === selected)
    || (b.driver === uid) - (a.driver === uid) || a.plate.localeCompare(b.plate));
  box.hidden = !cars.length;
  box.replaceChildren(...cars.map((c) => {
    const b = el('button', 'car-chip' + (c.id === selected ? ' on' : ''));
    b.type = 'button';
    b.append(plate(c.plate));
    if (c.model) b.append(el('small', '', c.model));
    b.setAttribute('aria-pressed', String(c.id === selected));
    b.addEventListener('click', () => onPick(c.id));
    return b;
  }));
}
export const carById = (id) => feed.state.cars.find((c) => c.id === id) || null;

// ---------- Водій: «Моя машина» у вкладці «Кілометраж» ----------
// Машина, на якій він їде сьогодні (або звична / закріплена)
export function renderMyCar(uid, entries, carId) {
  const box = $('myCar');
  const c = carById(carId) || feed.state.cars.find((x) => x.driver === uid);
  box.hidden = !c;
  if (!c) return;
  const k = carKm([...entries.map((e) => ({ ...e, uid })), ...feed.state.carKm.filter((e) => e.uid !== uid)], c);
  box.className = 'card my-car';
  const head = el('div', 'car-head');
  head.append(plate(c.plate), el('b', 'car-model', c.model || 'Моя машина'));
  box.replaceChildren(head);
  if (k) box.append(el('p', 'muted small-text my-car-km', `Останній показник: ${num.format(k.km)} км (${shortFmt.format(k.at)}${k.uid && k.uid !== uid ? ', вписав інший водій' : ''})`));
}

// Оновлювати картку водія, коли змінилась машина
feed.subscribe((s) => { st = s; if (!$('mileageView').hidden && s.user) document.dispatchEvent(new CustomEvent('cars-changed')); });
