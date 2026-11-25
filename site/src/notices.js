// Оголошення: керівник пише всім / водіям / кадрам / проєкту / одній людині,
// кадри — людям своїх проєктів. Отримувач бачить банер угорі, поки не натисне «Прочитав»;
// автор бачить, хто вже прочитав.
import * as cloud from './cloud.js';
import * as feed from './feed.js';
import { recipientsFor, toLabel, myUnread, readStats, isLive, MAX_TEXT } from './notice-calc.js';
import { iconEl, iconText } from './icons.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const timeFmt = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' });
const DAY = 86400000;
const SHOW = 3; // скільки банерів угорі одночасно

let me = null, st = feed.state, unsub = null, to = 'all', viewing = null;

const canWrite = () => me && (me.role === 'manager' || me.role === 'hr');
const isToday = (ms) => new Date(ms).toDateString() === new Date().toDateString();
const when = (ms) => (isToday(ms) ? 'сьогодні ' : dateFmt.format(ms) + ', ') + timeFmt.format(ms);
const nameOf = (uid) => st.users.find((u) => u.id === uid)?.name
  || st.projects.map((p) => p.names?.[uid]).find(Boolean) || '';

export function startNotices(profile) {
  stopNotices();
  me = { uid: profile.uid, role: profile.role, name: profile.name };
  $('inboxNotice').hidden = !canWrite();
  unsub = feed.subscribe((s) => {
    st = s;
    if (s.user) me.name = s.user.name;
    renderBar();
    if ($('ntSentDlg').open) renderSent();
    if ($('ntDlg').open) renderWho();
  });
}

export function stopNotices() {
  unsub?.(); unsub = null; me = null;
  $('noticeBar').hidden = true;
  $('inboxNotice').hidden = true;
  for (const d of ['ntDlg', 'ntSentDlg', 'ntViewDlg']) if ($(d).open) $(d).close();
}

function markRead(n) {
  cloud.markNoticeRead(n.id, me.uid).catch((e) => console.error(e));
}

// Шапка оголошення: «Оголошення · від Шеф · сьогодні 07:12»
function head(n) {
  const h = el('div', 'nt-head');
  h.append(iconEl('megaphone'), el('b', '', n.important ? 'Важливе оголошення' : 'Оголошення'));
  h.append(el('span', 'muted', `від ${n.byName || 'керівника'} · ${when(n.createdAt)}`));
  return h;
}

// ---------- Банери угорі ----------
function renderBar() {
  const bar = $('noticeBar');
  const list = me ? myUnread(st.notices, me.uid) : [];
  bar.hidden = !list.length;
  bar.replaceChildren(...list.slice(0, SHOW).map((n) => {
    const card = el('article', 'card notice' + (n.important ? ' imp' : ''));
    card.append(head(n), el('p', 'nt-text', n.text));
    const row = el('div', 'row');
    row.append(el('span', 'muted small-text', n.until ? `до ${dateFmt.format(n.until - 1)}` : ''));
    const ok = iconText(el('button', 'btn small start'), 'check', 'Прочитав');
    ok.type = 'button';
    ok.addEventListener('click', () => markRead(n));
    row.append(ok);
    card.append(row);
    return card;
  }));
  if (list.length > SHOW) bar.append(el('p', 'muted small-text center', `Ще ${list.length - SHOW} — у конвертику вгорі`));
}

// ---------- Одне оголошення (зі сповіщень) ----------
export function openNotice(id) {
  const n = st.notices.find((x) => x.id === id);
  if (!n) return;
  viewing = n;
  $('ntViewBody').replaceChildren(head(n), el('p', 'nt-text', n.text));
  const at = n.read?.[me.uid];
  const mine = (n.recipients || []).includes(me.uid);
  $('ntViewRead').hidden = !mine || !!at;
  $('ntViewState').textContent = at ? `Прочитано ${when(at)}` : '';
  $('ntViewDlg').showModal();
}
$('ntViewClose').addEventListener('click', () => $('ntViewDlg').close());
$('ntViewRead').addEventListener('click', () => { if (viewing) markRead(viewing); $('ntViewDlg').close(); });

// ---------- Нове оголошення ----------
const myProjects = () => st.projects.filter((p) => me.role === 'manager' || (p.hr || []).includes(me.uid));
const people = () => st.users
  .filter((u) => ['driver', 'hr'].includes(u.role) && u.id !== me.uid)
  .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'));

function target() {
  if (to === 'project') return $('ntProject').value || null;
  if (to === 'user') return $('ntUser').value || null;
  return null;
}
const recipients = () => recipientsFor({ to, target: target(), users: st.users, projects: st.projects, me: me.uid });

function setTo(v) {
  to = v;
  for (const b of $('ntTo').querySelectorAll('button')) b.classList.toggle('on', b.dataset.to === v);
  $('ntProjLabel').hidden = v !== 'project';
  $('ntUserLabel').hidden = v !== 'user';
  renderWho();
}

function renderWho() {
  const ids = recipients();
  const names = ids.map(nameOf).filter(Boolean);
  const w = $('ntWho');
  w.className = 'nt-who' + (ids.length ? '' : ' none');
  w.textContent = ids.length
    ? `Отримають ${ids.length}: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` і ще ${names.length - 6}` : ''}`
    : 'Нікого немає — вибери інших отримувачів.';
}

function openCompose() {
  if (!canWrite()) return;
  $('inboxPanel').hidden = true;
  $('ntForm').reset();
  $('ntErr').textContent = '';
  const hr = me.role === 'hr';
  // Кадри пишуть лише людям своїх проєктів
  for (const b of $('ntTo').querySelectorAll('button')) b.hidden = hr && b.dataset.to !== 'project';
  const projs = myProjects();
  $('ntProject').replaceChildren(...projs.map((p) => Object.assign(el('option', '', p.name), { value: p.id })));
  $('ntUser').replaceChildren(...people().map((u) => Object.assign(el('option', '', u.name || u.email), { value: u.id })));
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  $('ntUntil').min = d.toISOString().slice(0, 10);
  setTo(hr ? 'project' : 'all');
  if ($('ntSentDlg').open) $('ntSentDlg').close();
  $('ntDlg').showModal();
  $('ntText').focus();
}

for (const b of $('ntTo').querySelectorAll('button')) b.addEventListener('click', () => setTo(b.dataset.to));
$('ntProject').addEventListener('change', renderWho);
$('ntUser').addEventListener('change', renderWho);
$('ntCancel').addEventListener('click', () => $('ntDlg').close());
$('ntNewBtn').addEventListener('click', (e) => { e.stopPropagation(); openCompose(); });
$('ntSentNew').addEventListener('click', openCompose);

$('ntForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('ntText').value.trim().slice(0, MAX_TEXT);
  if (!text) { $('ntErr').textContent = 'Напиши текст оголошення.'; return; }
  const ids = recipients();
  if (!ids.length) { $('ntErr').textContent = 'Немає кому надіслати.'; return; }
  const raw = $('ntUntil').value;
  const until = raw ? +new Date(raw + 'T00:00') + DAY : null; // до кінця вибраного дня
  if (until && until < Date.now()) { $('ntErr').textContent = 'Дата вже минула.'; return; }
  const names = Object.fromEntries(ids.map((id) => [id, (nameOf(id) || '…').slice(0, 60)]));
  const tgt = target();
  if (to === 'user' && tgt) names[tgt] = names[tgt] || nameOf(tgt);
  const n = {
    id: newId(), text, by: me.uid, byName: (me.name || '').slice(0, 60) || 'Керівник',
    to, target: tgt, recipients: ids, names, important: $('ntImp').checked, until,
    createdAt: Date.now(), read: {},
  };
  cloud.putNotice(n).catch((err) => {
    console.error(err);
    alert(err?.code === 'permission-denied'
      ? 'Немає доступу. Онови правила Firestore у Firebase Console.'
      : 'Не вдалося надіслати: ' + (err?.message || err));
  });
  $('ntDlg').close();
  openSent();
});

// ---------- Надіслані: хто прочитав ----------
function openSent() {
  $('inboxPanel').hidden = true;
  renderSent();
  if (!$('ntSentDlg').open) $('ntSentDlg').showModal();
}
$('ntSentBtn').addEventListener('click', (e) => { e.stopPropagation(); openSent(); });
$('ntSentClose').addEventListener('click', () => $('ntSentDlg').close());

function renderSent() {
  const list = st.notices
    .filter((n) => me.role === 'manager' || n.by === me.uid)
    .sort((a, b) => b.createdAt - a.createdAt);
  $('ntSentEmpty').hidden = list.length > 0;
  $('ntSentList').replaceChildren(...list.map((n) => {
    const li = el('li', 'nt-item' + (n.important ? ' imp' : '') + (isLive(n) ? '' : ' old'));
    li.append(el('p', 'nt-text', n.text));
    const meta = [toLabel(n, st.projects), when(n.createdAt)];
    if (n.by !== me.uid) meta.unshift(`від ${n.byName}`);
    if (n.until) meta.push(isLive(n) ? `до ${dateFmt.format(n.until - 1)}` : 'завершено');
    li.append(el('div', 'muted small-text', meta.join(' · ')));
    const { read, unread } = readStats(n);
    const total = read.length + unread.length;
    const sum = el('div', 'nt-sum' + (read.length === total ? ' all' : ''), `Прочитали ${read.length} з ${total}`);
    li.append(sum);
    const chips = el('div', 'nt-chips');
    for (const r of read) chips.append(iconText(el('span', 'pchip ok'), 'check', `${r.name} · ${timeFmt.format(r.at)}`));
    for (const r of unread) chips.append(el('span', 'pchip wait', `${r.name} · ще ні`));
    li.append(chips);
    const del = el('button', 'btn small danger', 'Видалити');
    del.type = 'button';
    del.addEventListener('click', () => {
      if (confirm('Видалити це оголошення? Воно зникне в усіх.')) cloud.removeNotice(n.id).catch((e) => console.error(e));
    });
    const row = el('div', 'row');
    row.append(el('span'), del);
    li.append(row);
    return li;
  }));
}
