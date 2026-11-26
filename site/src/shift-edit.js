// Керівник виправляє зміну водія (забув «Почати» / «Закінчити») — чиста логіка без DOM.
// Виправлена зміна позначається: editedBy, editedByName, editedAt — водій бачить «змінив керівник».
import { breakMs } from './time.js';

export const LONG_SHIFT = 14 * 3600e3; // довше — схоже, що забули натиснути «Закінчити»

// f = { start, end|null, breakMin, note }; s — наявна зміна або null (нова)
export function editedShift(s, f, by, now = Date.now()) {
  const brk = Math.max(0, Math.round(f.breakMin || 0)) * 60000;
  let breaks;
  if (s?.breaks && Math.round(breakMs(s, now) / 60000) === Math.round(brk / 60000)) {
    // Перерви не змінювали — лишаємо як були (відкриту закриваємо разом із зміною)
    breaks = s.breaks.map((b) => ({ ...b, end: b.end ?? f.end ?? null }))
      .filter((b) => f.end == null || b.start < f.end)
      .map((b) => (f.end != null && b.end > f.end ? { ...b, end: f.end } : b));
  } else {
    const endAt = f.end ?? now;
    breaks = brk ? [{ start: Math.max(f.start, endAt - brk), end: endAt }] : [];
  }
  return {
    ...(s || {}),
    start: f.start,
    end: f.end,
    breaks,
    note: (f.note || '').trim().slice(0, 200),
    editedBy: by.uid,
    editedByName: (by.name || 'Керівник').slice(0, 60),
    editedAt: now,
  };
}

// Помилки (зупиняють збереження) і попередження (питаємо «точно?»)
export function checkShift(f, others, now = Date.now()) {
  const err = [], warn = [];
  if (!Number.isFinite(f.start)) err.push('Вкажи початок.');
  if (f.end != null && !(f.end > f.start)) err.push('Кінець має бути пізніше за початок.');
  if (f.start > now + 5 * 60000) err.push('Початок не може бути в майбутньому.');
  if (f.end != null && f.end > now + 5 * 60000) err.push('Кінець не може бути в майбутньому.');
  const len = (f.end ?? now) - f.start;
  if (!err.length && (f.breakMin || 0) * 60000 >= len) err.push('Перерви довші за саму зміну.');
  if (!err.length && len > 16 * 3600e3) warn.push(`Зміна вийде ${Math.round(len / 3600e3)} год.`);
  const end = f.end ?? now;
  if (!err.length && others.some((o) => o.start < end && (o.end ?? now) > f.start)) warn.push('Вона перетинається з іншою зміною цього водія.');
  return { err, warn };
}
