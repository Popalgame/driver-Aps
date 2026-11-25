// Оголошення — чиста логіка без DOM (tests/notices.test.mjs).
// notices/{id} { text, by, byName, to: 'all'|'drivers'|'hr'|'project'|'user', target: pid|uid|null,
//                recipients: [uid], names: {uid: ім'я}, important, until: мс|null, createdAt, read: {uid: мс} }
// Отримувачі фіксуються в момент надсилання.
export const MAX_TEXT = 500;
export const MAX_RECIPIENTS = 100;

const ACTIVE = ['driver', 'hr', 'manager'];

// Список uid, кому піде оголошення (без самого автора)
export function recipientsFor({ to, target, users = [], projects = [], me }) {
  const live = users.filter((u) => ACTIVE.includes(u.role));
  const off = new Set(users.filter((u) => !ACTIVE.includes(u.role)).map((u) => u.id));
  let ids = [];
  if (to === 'all') ids = live.map((u) => u.id);
  else if (to === 'drivers') ids = live.filter((u) => u.role === 'driver' && u.kind !== 'hr').map((u) => u.id);
  else if (to === 'hr') ids = live.filter((u) => u.role === 'hr').map((u) => u.id);
  else if (to === 'project') {
    const p = projects.find((x) => x.id === target);
    ids = p ? [...(p.members || []), ...(p.hr || [])].filter((id) => !off.has(id)) : [];
  } else if (to === 'user' && target) ids = [target];
  return [...new Set(ids)].filter((id) => id !== me).slice(0, MAX_RECIPIENTS);
}

export function toLabel(n, projects = [], names = {}) {
  if (n.to === 'all') return 'Усім';
  if (n.to === 'drivers') return 'Водіям';
  if (n.to === 'hr') return 'Кадрам';
  if (n.to === 'project') return `Проєкт «${projects.find((p) => p.id === n.target)?.name || '…'}»`;
  return names[n.target] || n.names?.[n.target] || 'Одній людині';
}

export const isLive = (n, now = Date.now()) => n.until == null || n.until > now;

// Мої непрочитані (я — отримувач): важливі першими, далі новіші
export function myUnread(notices, uid, now = Date.now()) {
  return notices
    .filter((n) => (n.recipients || []).includes(uid) && !n.read?.[uid] && isLive(n, now))
    .sort((a, b) => (b.important === true) - (a.important === true) || b.createdAt - a.createdAt);
}

// Хто прочитав / ще ні
export function readStats(n) {
  const read = [], unread = [];
  for (const uid of n.recipients || []) {
    const name = n.names?.[uid] || '…';
    if (n.read?.[uid]) read.push({ uid, name, at: n.read[uid] });
    else unread.push({ uid, name });
  }
  read.sort((a, b) => a.at - b.at);
  return { read, unread };
}
