// Встановлення апки на телефон / комп'ютер: кнопка (Android, Chrome, Edge) та інструкції (iPhone).
const $ = (id) => document.getElementById(id);

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
const isIOSChrome = isIOS && /CriOS/.test(ua);

export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Android / Chrome / Edge: браузер сам пропонує встановлення — ловимо подію й показуємо свою кнопку
let deferred = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  refresh();
});
addEventListener('appinstalled', () => {
  deferred = null;
  refresh();
});

async function promptInstall() {
  if (!deferred) return openGuide();
  deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  refresh();
}

function platform() {
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return 'desktop';
}

export function refresh() {
  const installed = isInstalled();
  // Налаштування
  $('instDone').hidden = !installed;
  $('instTodo').hidden = installed;
  $('instBtn').hidden = installed || !deferred;
  $('instHow').textContent = deferred ? 'Інструкція' : 'Як встановити';
}

function openGuide() {
  const p = platform();
  for (const el of document.querySelectorAll('#installDlg [data-os]')) {
    el.open = el.dataset.os === p;
  }
  $('iosChromeNote').hidden = !isIOSChrome;
  $('dlgInstallBtn').hidden = !deferred;
  $('installDlg').showModal();
}

$('instBtn').addEventListener('click', promptInstall);
$('instHow').addEventListener('click', openGuide);
$('loginInstall').addEventListener('click', () => (deferred ? promptInstall() : openGuide()));
$('dlgInstallBtn').addEventListener('click', () => { $('installDlg').close(); promptInstall(); });
$('installClose').addEventListener('click', () => $('installDlg').close());

refresh();
