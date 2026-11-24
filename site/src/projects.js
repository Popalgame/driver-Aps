// Вкладка «Проєкти» (керівник): створити проєкт, додати до нього водіїв, змінити, видалити.
// Водій бачить у календарі лише проєкти, до яких його додано.
import * as cloud from './cloud.js';
import { dayKey } from './mileage-calc.js';
import { COLORS, nextColor } from './calendar-calc.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let projects = [], users = [], events = [];
let stops = [];
let editing = null, color = 0;

const drivers = () => users.filter((u) => u.role === 'driver' || u.role === 'disabled')
  .sort((a, b) => (a.role === 'disabled') - (b.role === 'disabled') || (a.name || '').localeCompare(b.name || '', 'uk'));

function showError(e) {
  console.error(e);
  $('projErr').textContent = e?.code === 'permission-denied'
    ? '⚠ Немає доступу. Онови правила Firestore (site/firestore.rules) у Firebase Console.'
    : '⚠ Помилка: ' + (e?.message || e);
}

export function startProjects(profile) {
  stopProjects();
  $('projErr').textContent = '';
  stops = [
    cloud.watchProjects(profile.uid, true, (l) => { projects = l.sort((a, b) => a.name.localeCompare(b.name, 'uk')); render(); }, showError),
    cloud.watchUsers((l) => { users = l; render(); }, showError),
    cloud.watchEvents([], true, (l) => { events = l; render(); }, showError),
  ];
  render();
}
export function stopProjects() {
  for (const s of stops) s();
  stops = [];
  $('projDlg').open && $('projDlg').close();
}

function render() {
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
    // Імена — актуальні з профілів (якщо водія перейменували)
    const names = (p.members || []).map((uid) => users.find((u) => u.id === uid)?.name || p.names?.[uid]).filter(Boolean);
    li.append(el('div', 'badge', names.length ? `👥 ${names.join(', ')}` : '👥 Водіїв ще не додано'));
    const ahead = events.filter((e) => e.project === p.id && e.date >= today).length;
    li.append(el('div', 'badge', ahead ? `📅 Подій попереду: ${ahead}` : '📅 Подій попереду немає'));
    li.addEventListener('click', () => openProject(p));
    li.addEventListener('keydown', (k) => { if (k.key === 'Enter') openProject(p); });
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

function openProject(p) {
  editing = p || null;
  color = p ? p.color : nextColor(projects);
  $('projTitle').textContent = p ? 'Проєкт' : 'Новий проєкт';
  $('projName').value = p?.name || '';
  renderSwatches();
  const box = $('projDrivers');
  const ds = drivers();
  box.replaceChildren(...ds.map((u) => {
    const lab = el('label', 'check');
    const cb = Object.assign(el('input'), { type: 'checkbox', value: u.id, checked: !!p?.members?.includes(u.id) });
    lab.append(cb, el('span', '', u.name || u.email));
    if (u.role === 'disabled') lab.append(el('small', 'muted', ' (доступ закрито)'));
    return lab;
  }));
  if (!ds.length) box.append(el('p', 'muted small-text', 'Ще немає водіїв — додай їх у вкладці «Водії».'));
  $('projDel').hidden = !p;
  $('projDlgErr').textContent = '';
  $('projDlg').showModal();
  if (!p) $('projName').focus();
}

$('projAdd').addEventListener('click', () => openProject(null));
$('projCancel').addEventListener('click', () => $('projDlg').close());

$('projDel').addEventListener('click', async () => {
  if (!editing) return;
  const n = events.filter((e) => e.project === editing.id).length;
  if (!confirm(`Видалити проєкт «${editing.name}»${n ? ` і всі його події (${n})` : ''}? Це не можна скасувати.`)) return;
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
  const members = [...$('projDrivers').querySelectorAll('input:checked')].map((c) => c.value);
  const names = Object.fromEntries(members.map((uid) => [uid, (users.find((u) => u.id === uid)?.name || '').slice(0, 60)]));
  const p = { id: editing?.id || newId(), name, members, names, color, createdAt: editing?.createdAt || Date.now() };
  cloud.putProject(p).catch(showError);
  $('projDlg').close();
});
