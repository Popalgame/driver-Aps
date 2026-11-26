// Вкладка «Налаштування»: профіль, пароль, налаштування апки на цьому пристрої, про апку.
import * as cloud from './cloud.js';
import { VERSION_LABEL } from './version.js';
import { photoFromFile, setAvatar } from './photo.js';
import { driverCarEl, getPersonal } from './cars.js';
import * as feed from './feed.js';

const $ = (id) => document.getElementById(id);
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');

// ---------- Налаштування на цьому пристрої (localStorage) ----------
const PREFS_KEY = 'driver-prefs';
const DEFAULTS = { confirmEnd: true, bigText: false };

export const prefs = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
})();

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* сховище недоступне */ }
  applyPrefs();
}

export function applyPrefs() {
  document.documentElement.classList.toggle('big-text', !!prefs.bigText);
}

$('pConfirm').addEventListener('change', (e) => { prefs.confirmEnd = e.target.checked; savePrefs(); });
$('pBig').addEventListener('change', (e) => { prefs.bigText = e.target.checked; savePrefs(); });

// ---------- Профіль і пароль ----------
let profile = null;
let onNameChanged = () => {};
export function onProfileName(cb) { onNameChanged = cb; }

const ROLE_NAMES = { manager: 'керівник', driver: 'водій', hr: 'кадри' };

function msg(id, text, ok) {
  $(id).textContent = text;
  $(id).className = 'msg ' + (ok ? 'ok' : 'err');
}

export function showSettings(p) {
  profile = p;
  $('sProfile').hidden = !p;
  $('sSecurity').hidden = !p;
  if (p) {
    $('sName').value = p.name || '';
    $('sEmail').textContent = p.email || '';
    $('sRole').textContent = ROLE_NAMES[p.role] || '';
    $('sUser').value = p.email || '';
    renderPhoto();
  }
  renderCar();
  $('sPhotoMsg').textContent = '';
  for (const id of ['sNameMsg', 'sPassMsg']) $(id).textContent = '';
  $('sPassForm').reset();
  $('pConfirm').checked = !!prefs.confirmEnd;
  $('pBig').checked = !!prefs.bigText;
  $('sVer').textContent = VERSION_LABEL;
  $('sAppUrl').textContent = APP_URL;
  $('sCopyUrl').textContent = 'Скопіювати посилання';
}

$('sNameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!profile) return;
  const name = $('sName').value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 60) { msg('sNameMsg', 'Ім\'я — від 1 до 60 символів.'); return; }
  if (name === profile.name) { msg('sNameMsg', 'Ім\'я не змінилось.', true); return; }
  const btn = e.submitter; if (btn) btn.disabled = true;
  msg('sNameMsg', 'Зберігаю…', true);
  try {
    await cloud.updateMyName(profile.uid, name);
    profile.name = name;
    onNameChanged(profile);
    msg('sNameMsg', '✓ Ім\'я збережено.', true);
  } catch (err) {
    console.error(err);
    msg('sNameMsg', 'Не вдалося зберегти: ' + (err?.message || err));
  } finally {
    if (btn) btn.disabled = false;
  }
});

// ---------- Машина (на якій водій сьогодні / востаннє / закріплена) ----------
function renderCar() {
  const n = profile && profile.role !== 'hr' ? driverCarEl(profile.uid, [...feed.state.carKm, ...ownKm], true, getPersonal()) : null;
  $('sCar').replaceChildren(...(n ? [n] : []));
}
feed.subscribe(() => { if (profile && !$('settingsView').hidden) renderCar(); });
let ownKm = [];
document.addEventListener('own-km', (e) => { ownKm = e.detail || []; });
document.addEventListener('own-car-changed', () => { if (profile && !$('settingsView').hidden) renderCar(); });

// ---------- Фото ----------
function renderPhoto() {
  setAvatar($('sPhotoBtn'), profile?.name, profile?.photo);
  $('sPhotoDel').hidden = !profile?.photo;
  $('sPhotoSet').lastChild.textContent = profile?.photo ? ' Змінити фото' : ' Додати фото';
}
const pickPhoto = () => $('sPhotoFile').click();
$('sPhotoBtn').addEventListener('click', pickPhoto);
$('sPhotoSet').addEventListener('click', pickPhoto);
async function savePhoto(photo) {
  msg('sPhotoMsg', 'Зберігаю…', true);
  try {
    await cloud.setUserPhoto(profile.uid, photo);
    profile.photo = photo;
    renderPhoto();
    onNameChanged(profile);
    msg('sPhotoMsg', photo ? '✓ Фото збережено.' : 'Фото прибрано.', true);
  } catch (err) {
    console.error(err);
    msg('sPhotoMsg', err?.code === 'permission-denied' ? 'Немає доступу — онови апку.' : 'Не вдалося: ' + (err?.message || err));
  }
}
$('sPhotoFile').addEventListener('change', async () => {
  const f = $('sPhotoFile').files[0];
  $('sPhotoFile').value = '';
  if (!f || !profile) return;
  try {
    const photo = await photoFromFile(f);
    if (photo) await savePhoto(photo);
  } catch (err) { msg('sPhotoMsg', err.message); }
});
$('sPhotoDel').addEventListener('click', () => { if (profile && confirm('Прибрати фото?')) savePhoto(null); });

$('sPassForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cur = $('sCur').value, next = $('sNew').value, next2 = $('sNew2').value;
  if (!cur) { msg('sPassMsg', 'Введи поточний пароль.'); return; }
  if (next.length < 6) { msg('sPassMsg', 'Новий пароль — щонайменше 6 символів.'); return; }
  if (next !== next2) { msg('sPassMsg', 'Нові паролі не збігаються.'); return; }
  if (next === cur) { msg('sPassMsg', 'Новий пароль такий самий, як поточний.'); return; }
  const btn = e.submitter; if (btn) btn.disabled = true;
  msg('sPassMsg', 'Змінюю…', true);
  try {
    await cloud.changePassword(cur, next);
    $('sPassForm').reset();
    msg('sPassMsg', '✓ Пароль змінено. Наступного разу входь з новим паролем.', true);
  } catch (err) {
    console.error(err);
    const wrong = ['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials'].includes(err?.code);
    msg('sPassMsg', wrong ? 'Поточний пароль невірний.' : cloud.authError(err));
  } finally {
    if (btn) btn.disabled = false;
  }
});

// ---------- Про апку ----------
$('sCopyUrl').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(APP_URL);
    $('sCopyUrl').textContent = 'Скопійовано ✓';
  } catch {
    $('sCopyUrl').textContent = 'Виділи адресу й скопіюй';
  }
});
