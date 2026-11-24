// Чиста логіка підрахунку часу — без DOM, тому її легко тестувати (tests/time.test.mjs).
// Зміна: { id, start, end|null, breaks: [{start, end|null}], note }  (час у мс)

export function breakMs(s, now = Date.now()) {
  return s.breaks.reduce((sum, b) => sum + ((b.end ?? now) - b.start), 0);
}

export function workMs(s, now = Date.now()) {
  return Math.max(0, (s.end ?? now) - s.start - breakMs(s, now));
}

// Робочий час зміни, що припадає на інтервал [from, to)
export function workInRange(s, from, to, now = Date.now()) {
  const a = Math.max(s.start, from);
  const b = Math.min(s.end ?? now, to);
  if (b <= a) return 0;
  let ms = b - a;
  for (const br of s.breaks) {
    const x = Math.max(br.start, a);
    const y = Math.min(br.end ?? now, b);
    if (y > x) ms -= y - x;
  }
  return Math.max(0, ms);
}

export function totalSince(shifts, from, now = Date.now()) {
  return shifts.reduce((sum, s) => sum + workInRange(s, +from, now + 1, now), 0);
}

const pad = (n) => String(n).padStart(2, '0');

export function clock(ms) {
  const t = Math.floor(ms / 1000);
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
}

export function hm(ms) {
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)} год ${pad(m % 60)} хв`;
}

export function startOfDay(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
export function startOfWeek(d = new Date()) {
  const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x;
}
export function startOfMonth(d = new Date()) {
  const x = startOfDay(d); x.setDate(1); return x;
}
