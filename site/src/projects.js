// Вкладка «Проєкти» (керівник): створити проєкт, одразу додати до нього нових
// або наявних водіїв, змінити, видалити. Водій бачить лише проєкти, до яких його додано.
import * as cloud from './cloud.js';
import * as feed from './feed.js';
import { dayKey } from './mileage-calc.js';
import { COLORS, nextColor } from './calendar-calc.js';
import { openAddDriver } from './manager.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let projects = [], users = [], events = [];
let unsub = null;
let editing = null, color = 0;
let extra = new Map(); // нові водії, створені з діалогу проєкту (ще не в списку users)

const nameOf = (uid, p) => users.find((u) => u.id === uid)?.name || extra.get(uid) || p?.names?.[uid] || '';
const drivers = () => users.filter((u) => u.role === 'driver' || u.role === 'disabled')
  .sort((a, b) => (a.role === 'disabled') - (b.role === 'disabled') || (a.name || '').localeCompare(b.name || '', 'uk'));

function showError(e) {
  console.error(e);
  $('projErr').textContent = e?.code === 'permission-denied'
    ? '⚠ Немає доступу. Онови правила Firestore (site/firestore.rules) у Firebase Console.'
    : '⚠ Помилка: ' + (e?.message || e);
}

export function startProjects() {
  unsub?.();
  $('projErr').textContent = '';
  unsub = feed.subscribe((st) => {
    projects = st.projects; users = st.users; events = st.events;
    if (st.error) showError(st.error);
    render();
  });
}
export function stopProjects() {
  unsub?.(); unsub = null;
  $('projDlg').open && $('projDlg').close();
}

function save(p) {
  const names = Object.fromEntries(p.members.map((uid) => [uid, nameOf(uid, p).slice(0, 60)]));
  return cloud.putProject({ ...p, names }).catch(showError);
}

function render() {
  if ($('projectsView').hidden) return;
  const today = dayKey(Date.now());
  const list = $('projList');
  list.replaceChildren();
  for (const p of projects) {
    const li = el('li', 'card driver proj');
    li.style.setProperty('--c', COLORS[p.color] || COLORS[0]);
    li.tabIndex = 0;
    const head = el('div', 'proj-head');
    head.append(el('span', 'proj-dot'), el('b', 'dname', p.name));
    li.append(head);
    // Водії проєкту — «чипами»; імена актуальні з профілів
    const team = el('div', 'proj-team');
    for (const uid of p.members || []) {
      const off = users.find((u) => u.id === uid)?.role === 'disabled';
      team.append(el('span', 'pchip' + (off ? ' off' : ''), nameOf(uid, p) || '…'));
    }
    if (!p.members?.length) team.append(el('span', 'muted small-text', 'Водіїв ще не додано'));
    li.append(team);
    const ahead = events.filter((e) => e.project === p.id && e.date >= today).length;
    const foot = el('div', 'row proj-foot');
    foot.append(el('span', 'badge', ahead ? `📅 Подій попереду: ${ahead}` : '📅 Подій попереду немає'));
    const add = el('button', 'btn small', '＋ Водій');
    add.type = 'button';
    add.title = 'Створити нового водія одразу в цьому проєкті';
    add.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openAddDriver((uid, name) => {
        extra.set(uid, name);
        save({ ...p, members: [...new Set([...(p.members || []), uid])] });
      }, `Новий водій · ${p.name}`);
    });
    foot.append(add);
    li.append(foot);
    li.addEventListener('click', () => openProject(p));
    li.addEventListener('keydown', (k) => { if (k.key === 'Enter' && k.target === li) openProject(p); });
    list.append(li);
  }
  $('projEmpty').hidden = projects.length > 0;
}

// ---------- Діалог проєкту ----------
function renderSwatches() {
  const box = $('projColors');
  box.replaceChildren(...COLORS.map((c, i) => {
    const b = el('button', 'sw' + (i === color ? ' on' : ''));
    b.type = 'button';
    b.style.background = c;
    b.setAttribute('aria-label', `Колір ${i + 1}`);
    b.addEventListener('click', () => { color = i; renderSwatches(); });
    return b;
  }));
}

function driverRow(uid, name, checked, off) {
  const lab = el('label', 'check');
  const cb = Object.assign(el('input'), { type: 'checkbox', value: uid, checked });
  lab.append(cb, el('span', '', name));
  if (off) lab.append(el('small', 'muted', ' (доступ закрито)'));
  return lab;
}

function openProject(p) {
  editing = p || null;
  color = p ? p.color : nextColor(projects);
  $('projTitle').textContent = p ? 'Проєкт' : 'Новий проєкт';
  $('projName').value = p?.name || '';
  renderSwatches();
  const box = $('projDrivers');
  const ds = drivers();
  box.replaceChildren(...ds.map((u) => driverRow(u.id, u.name || u.email, !!p?.members?.includes(u.id), u.role === 'disabled')));
  $('projNoDrivers').hidden = ds.length > 0;
  $('projDel').hidden = !p;
  $('projDlgErr').textContent = '';
  $('projDlg').showModal();
  if (!p) $('projName').focus();
}

$('projAdd').addEventListener('click', () => openProject(null));
$('projCancel').addEventListener('click', () => $('projDlg').close());

// Створити нового водія прямо з проєкту — він одразу з галочкою
$('projNewDriver').addEventListener('click', () => {
  const pname = $('projName').value.trim();
  openAddDriver((uid, name) => {
    extra.set(uid, name);
    $('projDrivers').prepend(driverRow(uid, name, true, false));
    $('projNoDrivers').hidden = true;
  }, pname ? `Новий водій · ${pname}` : 'Новий водій');
});

$('projDel').addEventListener('click', async () => {
  if (!editing) return;
  const n = events.filter((e) => e.project === editing.id).length;
  if (!confirm(`Видалити проєкт «${editing.name}»${n ? ` і всі його події (${n})` : ''}? Водії залишаться у фірмі. Це не можна скасувати.`)) return;
  const id = editing.id;
  $('projDlg').close();
  cloud.removeProject(id).catch(showError);
});

$('projForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = $('projName').value.trim().replace(/\s+/g, ' ');
  if (!name) { $('projDlgErr').textContent = 'Напиши назву проєкту.'; return; }
  if (projects.some((p) => p.id !== editing?.id && p.name.toLowerCase() === name.toLowerCase())) {
    $('projDlgErr').textContent = 'Проєкт з такою назвою вже є.'; return;
  }
  const members = [...new Set([...$('projDrivers').querySelectorAll('input:checked')].map((c) => c.value))];
  save({ id: editing?.id || newId(), name, members, color, createdAt: editing?.createdAt || Date.now() });
  $('projDlg').close();
});
