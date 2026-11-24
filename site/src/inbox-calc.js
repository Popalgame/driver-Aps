// Сповіщення — чиста логіка без DOM (tests/inbox.test.mjs).
// Будуються з даних, які апка вже має: події календаря, проєкти, (керівнику) нові користувачі.
//   ctx = { uid, role, projects, events, users, joined: {pid: мс}, since, now }
// Елемент: { id, at, icon, text, sub, go: { tab, date?, project? } }
import { dayKey } from './mileage-calc.js';
import { keyToDate, peopleText } from './calendar-calc.js';

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
      // Водію — «потрібен водій», якщо завдання ще вільне
      const ask = e.need && role === 'driver' && (e.status || 'open') === 'open';
      items.push({
        id: `new-${e.id}`, at: e.createdAt, icon: ask ? 'alarm' : 'calendar',
        text: ask ? `Потрібен водій: «${e.title}»` : `${e.byName || 'Хтось'} додав(ла) ${e.need ? 'завдання' : 'подію'} «${e.title}»`,
        sub: evSub(e) + (ask && e.byName ? ` · від ${e.byName}` : ''), go,
      });
    }
    const editedAt = e.editedAt || e.updatedAt;
    if (e.editedBy && e.editedBy !== uid && editedAt >= since && editedAt - e.createdAt > 2000) {
      items.push({ id: `edit-${e.id}-${editedAt}`, at: editedAt, icon: 'pencil', text: `${e.editedByName || 'Хтось'} змінив(ла) подію «${e.title}»`, sub: evSub(e), go });
    }
    // Кроки завдання — усім у проєкті, крім самого водія
    if (e.need && e.driver && e.driver !== uid) {
      if (e.takenAt >= since && (e.status === 'taken' || e.status === 'onway' || e.status === 'done')) {
        items.push({ id: `take-${e.id}-${e.takenAt}`, at: e.takenAt, icon: 'userCheck', text: `${e.driverName || 'Водій'} взяв(ла) завдання «${e.title}»`, sub: evSub(e), go });
      }
      if (e.status === 'done' && e.doneAt >= since) {
        items.push({ id: `done-${e.id}-${e.doneAt}`, at: e.doneAt, icon: 'checkCircle', text: `${e.driverName || 'Водій'} виконав(ла) «${e.title}»`, sub: evSub(e), go });
      }
    }
    if (e.date === today || e.date === tomorrow) {
      const when = e.date === today ? 'Сьогодні' : 'Завтра';
      items.push({
        id: `soon-${e.id}-${e.date}`, at: Math.max(startToday, e.createdAt || 0), icon: 'alarm',
        text: `${when}: ${e.title}${e.time ? ` о ${e.time}` : ''}`,
        sub: [e.people ? peopleText(e.people) : '', proj.get(e.project)?.name].filter(Boolean).join(' · '), go,
      });
    }
  }

  if (role !== 'manager') {
    for (const [pid, at] of Object.entries(joined)) {
      const p = proj.get(pid);
      if (p) items.push({ id: `join-${pid}`, at, icon: 'folder', text: `Тебе додали до проєкту «${p.name}»`, sub: 'Події проєкту — у Календарі', go: { tab: 'calendar', project: pid } });
    }
  } else {
    for (const u of users) {
      if (u.role === 'pending') {
        items.push({ id: `pend-${u.id}`, at: u.createdAt || now, icon: 'userPlus', text: `${u.name || 'Новий користувач'} чекає підтвердження`, sub: u.email || '', go: { tab: 'manager' } });
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
