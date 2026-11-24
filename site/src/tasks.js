// Завдання — подія календаря, де потрібен водій (need: true).
// Шлях: Потрібен водій (open) → Взяв (taken) → В дорозі (onway) → Виконано (done).
// Чиста логіка без DOM (tests/tasks.test.mjs).

export const STATUS = {
  open: { label: 'Потрібен водій', icon: 'alarm', cls: 'open' },
  taken: { label: 'Взяв', icon: 'userCheck', cls: 'taken' },
  onway: { label: 'В дорозі', icon: 'car', cls: 'onway' },
  done: { label: 'Виконано', icon: 'checkCircle', cls: 'done' },
};

export const isTask = (e) => !!e.need;
export const statusOf = (e) => (e.need ? e.status || 'open' : null);

// Текст статусу: «Потрібен водій» / «Взяв: Андрій» / «В дорозі: Андрій» / «Виконано: Андрій»
export function statusText(e) {
  const s = statusOf(e);
  if (!s) return '';
  return s === 'open' ? STATUS.open.label : `${STATUS[s].label}: ${e.driverName || '—'}`;
}

// Що може зробити цей користувач зараз. role: 'driver' | 'manager' | 'hr'.
// Повертає { main: {label, icon, patch} | null, undo: {label, patch, ask} | null }
export function actions(e, uid, name, role, now = Date.now()) {
  const s = statusOf(e);
  const none = { main: null, undo: null };
  if (!s || role !== 'driver') return none;
  const mine = e.driver === uid;
  if (s === 'open') {
    return { main: { label: 'Беру завдання', icon: 'userCheck', patch: { status: 'taken', driver: uid, driverName: name, takenAt: now } }, undo: null };
  }
  if (!mine) return none;
  const giveUp = { label: 'Відмовитись', ask: 'Відмовитись від завдання? Воно знову стане вільним для інших водіїв.', patch: { status: 'open', driver: null, driverName: '', takenAt: null, startedAt: null } };
  if (s === 'taken') return { main: { label: 'Забрав людей — їду', icon: 'car', patch: { status: 'onway', startedAt: now } }, undo: giveUp };
  if (s === 'onway') return { main: { label: 'Привіз — виконано', icon: 'checkCircle', patch: { status: 'done', doneAt: now } }, undo: { label: 'Ще не забрав', patch: { status: 'taken', startedAt: null } } };
  return { main: null, undo: { label: 'Скасувати «виконано»', patch: { status: 'onway', doneAt: null } } };
}

// Для «Мій час»: завдання водія — активні (свої), вільні (у моїх проєктах, від сьогодні), виконані за період
export function myTasks(events, uid, todayKey, from = 0) {
  const tasks = events.filter(isTask);
  const byDate = (a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));
  return {
    active: tasks.filter((e) => e.driver === uid && (e.status === 'taken' || e.status === 'onway')).sort(byDate),
    free: tasks.filter((e) => statusOf(e) === 'open' && e.date >= todayKey).sort(byDate),
    done: tasks.filter((e) => e.driver === uid && e.status === 'done' && (e.doneAt || 0) >= from).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)),
  };
}
