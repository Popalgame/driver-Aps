// Календар — чиста логіка без DOM (tests/calendar.test.mjs).
// Подія: { id, project, date: 'РРРР-ММ-ДД', time: 'ГГ:ХХ' | '', title, people|null, note, by, byName }
import { dayKey } from './mileage-calc.js';

// Кольори проєктів (індекс зберігається в проєкті)
export const COLORS = ['#60a5fa', '#2dd4bf', '#fbbf24', '#a78bfa', '#f472b6', '#4ade80', '#fb923c', '#f87171'];

// Перший вільний колір для нового проєкту
export function nextColor(projects) {
  const used = new Set(projects.map((p) => p.color));
  for (let i = 0; i < COLORS.length; i++) if (!used.has(i)) return i;
  return projects.length % COLORS.length;
}

// Дні сітки місяця: з понеділка першого тижня до неділі останнього (5–6 тижнів)
export function monthGrid(monthStart) {
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const end = new Date(last); end.setDate(last.getDate() + (7 - ((last.getDay() + 6) % 7)) - 1);
  const days = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push({ key: dayKey(+d), day: d.getDate(), inMonth: d.getMonth() === first.getMonth(), weekend: d.getDay() === 0 || d.getDay() === 6 });
  }
  return days;
}

export const byTime = (a, b) => (a.date + (a.time || '99:99') + a.title).localeCompare(b.date + (b.time || '99:99') + b.title);

// Map(дата → події за часом)
export function eventsByDate(events) {
  const m = new Map();
  for (const e of [...events].sort(byTime)) {
    if (!m.has(e.date)) m.set(e.date, []);
    m.get(e.date).push(e);
  }
  return m;
}

// Найближчі події від сьогодні (включно)
export function upcoming(events, todayKey, limit = 8) {
  return events.filter((e) => e.date >= todayKey).sort(byTime).slice(0, limit);
}

export const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

// «5 чоловік» / «2 чоловіки» / «1 чоловік»
// Місць у машині для пасажирів: 9-те — водій
export const MAX_PEOPLE = 8;

export function peopleText(n) {
  if (!n) return '';
  const t = n % 100, u = n % 10;
  const w = t >= 11 && t <= 14 ? 'чоловік' : u === 1 ? 'чоловік' : u >= 2 && u <= 4 ? 'чоловіки' : 'чоловік';
  return `${n} ${w}`;
}
