// Сповіщення — чиста логіка без DOM (tests/inbox.test.mjs).
// Будуються з даних, які апка вже має: події календаря, проєкти, (керівнику) нові користувачі.
//   ctx = { uid, role, projects, events, users, joined: {pid: мс}, since, now }
// Елемент: { id, at, icon, text, sub, go: { tab, date?, project? } }
import { dayKey } from './mileage-calc.js';
import { keyToDate } from './calendar-calc.js';

const DAY = 86400000;
const dateFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function buildItems({ uid, role, projects = [], events = [], users = [], joined = {}, since = 0, now = Date.now() }) {
  const items = [];
  const proj = new Map(projects.map((p) => [p.id, p]));
  const today = dayKey(now);
  const tomorrow = dayKey(+keyToDate(today) + DAY + 3 * 3600e3);
  const startToday = +keyToDate(today);
  const evSub = (e) => [cap(dateFmt.format(keyToDate(e.date))) + (e.time ? ` о ${e.time}` : ''), proj.get(e.project)?.name].filter(Boolean).join(' · ');

  for (const e of events) {
    if (!proj.has(e.project)) continue;
    const go = { tab: 'calendar', date: e.date, project: e.project };
    if (e.by !== uid && e.createdAt >= since) {
      items.push({ id: `new-${e.id}`, at: e.createdAt, icon: '📅', text: `${e.byName || 'Хтось'} додав(ла) подію «${e.title}»`, sub: evSub(e), go });
    }
    if (e.editedBy && e.editedBy !== uid && e.updatedAt >= since && e.updatedAt - e.createdAt > 2000) {
      items.push({ id: `edit-${e.id}-${e.updatedAt}`, at: e.updatedAt, icon: '✏️', text: `${e.editedByName || 'Хтось'} змінив(ла) подію «${e.title}»`, sub: evSub(e), go });
    }
    if (e.date === today || e.date === tomorrow) {
      const when = e.date === today ? 'Сьогодні' : 'Завтра';
      items.push({
        id: `soon-${e.id}-${e.date}`, at: Math.max(startToday, e.createdAt || 0), icon: '⏰',
        text: `${when}: ${e.title}${e.time ? ` о ${e.time}` : ''}`,
        sub: [e.people ? `👥 ${e.people}` : '', proj.get(e.project)?.name].filter(Boolean).join(' · '), go,
      });
    }
  }

  if (role !== 'manager') {
    for (const [pid, at] of Object.entries(joined)) {
      const p = proj.get(pid);
      if (p) items.push({ id: `join-${pid}`, at, icon: '📁', text: `Тебе додали до проєкту «${p.name}»`, sub: 'Події проєкту — у Календарі', go: { tab: 'calendar', project: pid } });
    }
  } else {
    for (const u of users) {
      if (u.role === 'pending') {
        items.push({ id: `pend-${u.id}`, at: u.createdAt || now, icon: '👤', text: `${u.name || 'Новий користувач'} чекає підтвердження`, sub: u.email || '', go: { tab: 'manager' } });
      }
    }
  }

  return items.filter((i) => i.at >= now - 30 * DAY).sort((a, b) => b.at - a.at).slice(0, 50);
}

// Непрочитані: новіші за «прочитати всі» і не відкриті окремо
export const isUnread = (item, seen) => item.at > (seen.readAll || 0) && !(seen.read || []).includes(item.id);

// Нові проєкти водія (його додали) — фіксуємо момент, коли апка це побачила
export function trackJoins(seen, projectIds, now = Date.now()) {
  if (!seen.projects) return { ...seen, projects: projectIds, joined: seen.joined || {} }; // перший запуск — без сповіщень
  const joined = { ...(seen.joined || {}) };
  for (const id of projectIds) if (!seen.projects.includes(id) && !joined[id]) joined[id] = now;
  for (const id of Object.keys(joined)) if (!projectIds.includes(id)) delete joined[id];
  return { ...seen, projects: projectIds, joined };
}
