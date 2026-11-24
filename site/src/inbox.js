// Конвертик сповіщень угорі праворуч: нові й змінені події, нагадування «сьогодні / завтра»,
// «тебе додали до проєкту», (керівнику) нові користувачі. Що прочитано — пам'ятає цей пристрій.
import * as feed from './feed.js';
import { buildItems, isUnread, trackJoins } from './inbox-calc.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });
const KEY = 'driver-inbox-';
const ago = new Intl.RelativeTimeFormat('uk-UA', { numeric: 'auto' });
const dateFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

let uid = null, seen = {}, items = [], go = () => {};
let unsub = null;

function load(u) {
  try { return JSON.parse(localStorage.getItem(KEY + u)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY + uid, JSON.stringify(seen)); } catch { /* немає місця */ }
}

function when(ms) {
  const diff = Date.now() - ms;
  if (diff < 60e3) return 'щойно';
  if (diff < 3600e3) return ago.format(-Math.round(diff / 60e3), 'minute');
  if (diff < 12 * 3600e3) return ago.format(-Math.round(diff / 3600e3), 'hour');
  return dateFmt.format(ms);
}

// onGo(go) — перейти до того, про що сповіщення (вкладка, дата в календарі)
export function initInbox(onGo) { go = onGo; }

export function startInbox(profile) {
  stopInbox();
  uid = profile.uid;
  seen = load(uid);
  // Перший запуск на цьому пристрої: показуємо події лише за останні 3 дні
  if (!seen.since) { seen.since = Date.now() - 3 * 86400000; save(); }
  $('inboxBtn').hidden = false;
  unsub = feed.subscribe((st) => {
    if (!st.user) return;
    if (st.loaded && st.user.role !== 'manager') {
      const next = trackJoins(seen, st.projects.map((p) => p.id));
      if (JSON.stringify(next) !== JSON.stringify(seen)) { seen = next; save(); }
    }
    items = buildItems({ uid, role: st.user.role, projects: st.projects, events: st.events, users: st.users, joined: seen.joined, since: seen.since });
    render();
  });
}

export function stopInbox() {
  unsub?.(); unsub = null;
  uid = null; items = [];
  close();
  $('inboxBtn').hidden = true;
  setBadge(0);
}

function setBadge(n) {
  $('inboxBadge').hidden = !n;
  $('inboxBadge').textContent = n > 9 ? '9+' : String(n);
  $('inboxBtn').setAttribute('aria-label', n ? `Сповіщення: ${n} нових` : 'Сповіщення');
  $('inboxBtn').classList.toggle('has', !!n);
  // Цифра на іконці встановленої апки (де підтримується)
  try { if (n) navigator.setAppBadge?.(n); else navigator.clearAppBadge?.(); } catch { /* не підтримується */ }
}

function render() {
  const unread = items.filter((i) => isUnread(i, seen));
  setBadge(unread.length);
  $('inboxReadAll').hidden = !unread.length;
  $('inboxEmpty').hidden = items.length > 0;
  $('inboxList').replaceChildren(...items.map((i) => {
    const li = el('li', 'inbox-item' + (isUnread(i, seen) ? ' unread' : ''));
    li.tabIndex = 0;
    li.append(el('span', 'ii-ico', i.icon));
    const body = el('div', 'ii-body');
    body.append(el('div', 'ii-text', i.text));
    if (i.sub) body.append(el('div', 'ii-sub', i.sub));
    body.append(el('div', 'ii-when', when(i.at)));
    li.append(body);
    const open = () => {
      if (!(seen.read || []).includes(i.id)) { seen.read = [...(seen.read || []), i.id].slice(-200); save(); }
      close();
      render();
      go(i.go);
    };
    li.addEventListener('click', open);
    li.addEventListener('keydown', (k) => { if (k.key === 'Enter') open(); });
    return li;
  }));
}

function open() {
  $('inboxPanel').hidden = false;
  $('inboxBtn').setAttribute('aria-expanded', 'true');
  render();
}
function close() {
  $('inboxPanel').hidden = true;
  $('inboxBtn').setAttribute('aria-expanded', 'false');
}

$('inboxBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  if ($('inboxPanel').hidden) open(); else close();
});
$('inboxReadAll').addEventListener('click', () => {
  seen.readAll = Date.now();
  seen.read = [];
  save();
  render();
});
document.addEventListener('click', (e) => {
  if (!$('inboxPanel').hidden && !$('inboxPanel').contains(e.target)) close();
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
// Час «5 хв тому» оновлюється
setInterval(() => { if (!$('inboxPanel').hidden) render(); }, 60000);
