// Кілометраж на початок дня.
// При першому «Почати роботу» за календарний день, якщо за сьогодні кілометраж ще не вписано,
// апка питає показник одометра. Друга зміна того ж дня — вже не питає.
// «Пізніше» — зміна стартує, а на «Мій час» висить нагадування, поки водій не впише.
import * as cloud from './cloud.js';
import { startOfDay } from './time.js';
import { hasOdoOn, previousOdo, dayKey, defaultCar, withCarKm } from './mileage-calc.js';
import { carChips, carById } from './cars.js';
import * as feed from './feed.js';

const $ = (id) => document.getElementById(id);
const num = new Intl.NumberFormat('uk-UA');
const dayFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const dateFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' });
const km = (v) => `${num.format(v)} км`;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

let user = null, entries = [], loaded = false, stop = null;
let onDone = null; // що зробити після «Зберегти» / «Пізніше» (почати зміну)
let getShifts = () => [];
let carSel = null; // машина на сьогодні

export function initOdo(shiftsGetter) { getShifts = shiftsGetter; }

export function startOdo(profile) {
  stopOdo();
  user = { uid: profile.uid };
  stop = cloud.watchMileage(profile.uid, (list) => { entries = list; loaded = true; renderRemind(); }, (e) => console.error(e));
}
export function stopOdo() {
  stop?.(); stop = null;
  user = null; entries = []; loaded = false;
  $('odoRemind').hidden = true;
}

// Питати? Лише коли дані вже завантажені (інакше не заважаємо старту — нагадування з'явиться пізніше)
export const needsOdo = () => !!user && loaded && !hasOdoOn(entries, +startOfDay());

// start — почати зміну; викликається і після «Зберегти», і після «Пізніше»
export function askOdo(start) {
  onDone = start;
  open(true);
}

// Машини: вибір угорі вікна; підказка «учора було» — для вибраної машини
function renderCars() {
  const cars = feed.state.cars;
  $('odoAskCarBox').hidden = !cars.length;
  if (cars.length && !carById(carSel)) carSel = defaultCar(entries, cars, user.uid);
  if (cars.length) carChips($('odoAskCars'), carSel, user.uid, (id) => { carSel = id; renderCars(); });
  const today = +startOfDay();
  const car = carById(carSel);
  const prev = previousOdo(withCarKm(entries, feed.state.carKm, user.uid), today, car ? car.id : undefined);
  $('odoAskPrev').textContent = prev
    ? `${dayKey(prev.at) === dayKey(today - 86400000) ? 'Учора' : 'Останній запис ' + dateFmt.format(prev.at)}${car ? ' на ' + car.plate : ''} було: ${km(prev.km)}`
    : car ? `На ${car.plate} ти ще не вписував — впиши, скільки зараз на одометрі.` : 'Перший запис — впиши, скільки зараз на одометрі.';
}

function open(starting) {
  const today = +startOfDay();
  $('odoAskDlg').dataset.mode = starting ? 'start' : 'only';
  $('odoAskDate').textContent = cap(dayFmt.format(today));
  carSel = null;
  renderCars();
  $('odoAskInput').value = '';
  $('odoAskErr').textContent = '';
  $('odoAskSave').lastChild.textContent = starting ? ' Зберегти і почати роботу' : ' Зберегти';
  $('odoAskLater').textContent = starting ? 'Пізніше' : 'Скасувати';
  $('odoAskDlg').showModal();
  $('odoAskInput').focus();
}

function finish() {
  $('odoAskDlg').close();
  const f = onDone; onDone = null;
  f?.();
}

$('odoAskLater').addEventListener('click', finish);
// Закрили кнопкою «Назад» / Escape — зміна однаково стартує (водій уже натиснув «Почати»)
$('odoAskDlg').addEventListener('cancel', (e) => { e.preventDefault(); finish(); });

$('odoAskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = Math.round(Number(String($('odoAskInput').value).replace(/\s/g, '').replace(',', '.')));
  if (!Number.isFinite(v) || v <= 0) { $('odoAskErr').textContent = 'Впиши кілометраж числом, наприклад 152400.'; return; }
  const today = +startOfDay();
  const car = carById(carSel);
  if (feed.state.cars.length && !car) { $('odoAskErr').textContent = 'Вибери машину, на якій їдеш сьогодні.'; return; }
  const prev = previousOdo(withCarKm(entries, feed.state.carKm, user.uid), today, car ? car.id : undefined);
  if (prev && v < prev.km && !confirm(`Це менше, ніж ${km(prev.km)} (${dateFmt.format(prev.at)}). Перевір. Зберегти все одно?`)) return;
  if (prev && v - prev.km > 3000 && !confirm(`Від попереднього запису +${km(v - prev.km)}. Точно правильно?`)) return;
  const id = `odo_${user.uid}_${dayKey(today)}`;
  const entry = { id, type: 'odo', at: today, km: v, liters: null, amount: null, note: '', ...(car ? { car: car.id, plate: car.plate } : {}) };
  // Одразу на екрані (нагадування зникає), сервер підтвердить у фоні — працює й без інтернету
  entries = entries.filter((x) => x.id !== id).concat(entry);
  cloud.putMileage(user.uid, entry).catch((err) => console.error(err));
  renderRemind();
  finish();
});

// Нагадування на «Мій час»: сьогодні вже працював (або на зміні), а кілометраж не вписано
export function renderRemind() {
  const today = +startOfDay();
  const worked = getShifts().some((s) => s.end == null || s.start >= today);
  $('odoRemind').hidden = !(user && loaded && worked && !hasOdoOn(entries, today));
}
$('odoRemind').addEventListener('click', () => { onDone = null; open(false); });
