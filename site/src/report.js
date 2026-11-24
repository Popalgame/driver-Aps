// Звіти для керівника і CSV — чиста логіка без DOM (tests/report.test.mjs).
import { breakMs, workMs, workInRange } from './time.js';

// Підсумок по водіях за період [from, to).
// Повертає [{ uid, name, email, role, total, count, active, onBreak, shifts }] —
// спершу ті, хто зараз на зміні, далі за робочим часом; із закритим доступом — у кінці.
// Користувачі, що чекають підтвердження ('pending'), і керівники до списку не входять
// (хіба що мають зміни за період).
export function summarizeByDriver(shifts, users, from, to, now = Date.now()) {
  const byUid = new Map();
  const row = (uid, name = '', email = '') => {
    if (!byUid.has(uid)) byUid.set(uid, { uid, name, email, role: '', total: 0, count: 0, active: null, onBreak: false, shifts: [] });
    return byUid.get(uid);
  };
  for (const u of users) if (u.role === 'driver' || u.role === 'disabled') row(u.id ?? u.uid, u.name, u.email);
  for (const s of shifts) {
    const r = row(s.uid, s.driverName || '');
    const ms = workInRange(s, from, to, now);
    if (s.end == null) {
      r.active = s;
      r.onBreak = s.breaks.some((b) => b.end == null);
    }
    if (ms > 0 || s.end == null) {
      r.total += ms;
      r.count += 1;
      r.shifts.push(s);
    }
  }
  for (const u of users) {
    const r = byUid.get(u.id ?? u.uid);
    if (!r) continue;
    if (u.name) r.name = u.name;
    if (u.email) r.email = u.email;
    r.role = u.role || '';
  }
  const list = [...byUid.values()];
  for (const r of list) {
    r.name = r.name || 'Без імені';
    r.shifts.sort((a, b) => b.start - a.start);
  }
  const off = (r) => (r.role === 'disabled' ? 1 : 0);
  return list.sort((a, b) => (off(a) - off(b)) || (!!b.active - !!a.active) || (b.total - a.total) || a.name.localeCompare(b.name, 'uk'));
}

const timeFmt = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });

// Рядки CSV для завершених змін. names — Map uid → ім'я (необов'язково).
export function shiftsToCsv(shifts, names) {
  const head = ['Дата', 'Початок', 'Кінець', 'Перерви (хв)', 'Робочий час (год)', 'Нотатка'];
  if (names) head.unshift('Водій');
  const rows = [head];
  for (const s of [...shifts].sort((a, b) => a.start - b.start)) {
    if (s.end == null) continue;
    const r = [
      new Date(s.start).toLocaleDateString('uk-UA'),
      timeFmt.format(s.start),
      timeFmt.format(s.end),
      Math.round(breakMs(s) / 60000),
      (workMs(s) / 3600000).toFixed(2).replace('.', ','),
      s.note || '',
    ];
    if (names) r.unshift(names.get(s.uid) || s.driverName || '');
    rows.push(r);
  }
  // ; і BOM — щоб Excel з українською локаллю відкрив коректно
  return '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

export function downloadCsv(csv, name) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
