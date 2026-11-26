// Встановлення апки: Android і комп'ютер — одна кнопка «Скачати»; iPhone — лише інструкція
// (Safari не дозволяє встановити кнопкою).
const $ = (id) => document.getElementById(id);

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
const isIOSChrome = isIOS && /CriOS/.test(ua);

export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Android / Chrome / Edge: браузер дозволяє встановити — ловимо подію для своєї кнопки
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

let alertHint = false; // з екрана входу — повідомлення вікном (підказки в налаштуваннях не видно)
function hint(t) {
  $('instHint').textContent = t;
  $('instHint').hidden = !t;
  if (t && alertHint) alert(t);
}

async function install(fromLogin = false) {
  alertHint = fromLogin === true;
  if (!deferred) {
    // Браузер не дає встановити (Firefox, Safari на Mac, або вже відмовились раніше)
    hint(isAndroid
      ? 'Цей браузер не дає скачати апку кнопкою. Відкрий driver-aps.web.app у Chrome, натисни ⋮ угорі → «Встановити застосунок».'
      : 'Цей браузер не дає скачати апку кнопкою. Відкрий driver-aps.web.app у Chrome або Edge і натисни «Скачати» ще раз (або значок встановлення в адресному рядку).');
    return;
  }
  hint('');
  deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  refresh();
}

export function refresh() {
  const installed = isInstalled();
  $('instDone').hidden = !installed;
  $('instTodo').hidden = installed;
  $('instIos').hidden = !isIOS;
  $('instOther').hidden = isIOS;
  $('instBtnText').textContent = isAndroid ? 'Скачати на телефон' : 'Скачати на ПК';
  $('loginInstall').lastChild.textContent = isIOS || isAndroid ? ' Встановити апку на телефон' : ' Скачати апку на ПК';
  for (const n of document.querySelectorAll('.ios-chrome-note')) n.hidden = !isIOSChrome;
}

$('instBtn').addEventListener('click', () => install());
// Екран входу: iPhone — інструкція, інші — одразу встановлення
$('loginInstall').addEventListener('click', () => (isIOS ? $('installDlg').showModal() : install(true)));
$('installClose').addEventListener('click', () => $('installDlg').close());

refresh();
