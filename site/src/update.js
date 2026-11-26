// Оновлення апки з видимим прогресом.
// Нова версія завантажується у фоні (sw.js шле «завантажено N з M»). Унизу з'являється
// «Доступна нова версія — Оновити». Натиснув — відкривається вікно зі смужкою завантаження;
// коли все завантажено — «Готово ✓», і апка перезапускається вже новою версією.
const $ = (id) => document.getElementById(id);
const RESCUE = 'driver-upd-rescue'; // після «Оновити апку» (сторож завантаження) — показати прогрес

let reg = null;
let prog = { done: 0, total: 0, ready: false, failed: false };
let open = false, reloading = false, shownAt = 0;

export function initUpdates() {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  let rescue = false;
  try { rescue = sessionStorage.getItem(RESCUE) === '1'; sessionStorage.removeItem(RESCUE); } catch { /* немає доступу */ }

  sw.addEventListener('message', (e) => {
    if (e.data?.type !== 'sw-progress') return;
    if (!hadController && !rescue) return; // перше відкриття — без вікна
    prog = { ...prog, ...e.data };
    if (e.data.failed) prog.ready = false;
    $('updateBar').hidden = false;
    render();
  });

  sw.register('sw.js').then((r) => {
    reg = r;
    const track = (w) => {
      if (!w || (!hadController && !rescue)) return;
      $('updateBar').hidden = false;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' || w.state === 'activated') { prog.ready = true; prog.failed = false; render(); }
        if (w.state === 'redundant' && !prog.ready) { prog.failed = true; render(); }
      });
    };
    if (r.waiting && hadController) { prog.ready = true; $('updateBar').hidden = false; }
    if (r.installing) track(r.installing);
    r.addEventListener('updatefound', () => track(r.installing));
    // Повернувся в апку — перевірити, чи немає нової версії
    document.addEventListener('visibilitychange', () => { if (!document.hidden) r.update().catch(() => {}); });
    // Після «Оновити апку»: сторінка вже нова, показуємо, як докачуються файли для офлайну
    if (rescue) showDialog();
    render();
  }).catch(() => {});

  sw.addEventListener('controllerchange', () => {
    if (!hadController) { if (open) finish(false); return; } // перше встановлення / після «Оновити апку»
    finish(true);
  });

  $('updateBtn').addEventListener('click', showDialog);
  $('updRetry').addEventListener('click', () => {
    prog = { done: 0, total: prog.total, ready: false, failed: false };
    render();
    reg?.update().catch(() => { prog.failed = true; render(); });
  });
  $('updClose').addEventListener('click', () => { open = false; $('updDlg').close(); });
  $('updDlg').addEventListener('cancel', (e) => { if (!prog.failed) e.preventDefault(); }); // не закривати посеред завантаження
}

function showDialog() {
  open = true;
  shownAt = Date.now();
  if (!$('updDlg').open) $('updDlg').showModal();
  render();
}

function render() {
  const pct = prog.ready ? 100 : prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  // Смужка внизу
  $('updateText').textContent = prog.failed ? 'Оновлення не завантажилось'
    : prog.ready ? 'Доступна нова версія' : `Нова версія: ${pct}%`;
  if (!open) return;
  $('updFill').style.width = `${pct}%`;
  $('updPct').textContent = `${pct}%`;
  $('updRetry').hidden = $('updClose').hidden = !prog.failed;
  $('updDlg').classList.toggle('failed', prog.failed);
  if (prog.failed) {
    $('updStep').textContent = 'Не вдалося завантажити нову версію. Перевір інтернет і спробуй ще раз.';
    $('updCount').textContent = '';
    return;
  }
  $('updCount').textContent = prog.total ? `Завантажено файлів: ${prog.ready ? prog.total : prog.done} з ${prog.total}` : 'Готуємо завантаження…';
  if (!prog.ready) { $('updStep').textContent = 'Завантажую нову версію…'; return; }
  if (reloading) return;
  // Усе завантажено — вмикаємо нову версію (sw.js → controllerchange → перезапуск)
  $('updStep').textContent = 'Усе завантажено. Вмикаю нову версію…';
  if (reg?.waiting) reg.waiting.postMessage({ type: 'skip' });
  else if (navigator.serviceWorker.controller && !reg?.installing) finish(true);
}

// Показати «Готово ✓» (щонайменше секунду, щоб людина побачила) і перезапустити
function finish(reload) {
  if (reloading) return;
  reloading = true;
  if (!open) { if (reload) location.reload(); return; }
  prog.ready = true;
  $('updFill').style.width = '100%';
  $('updPct').textContent = '100%';
  $('updDlg').classList.add('done');
  $('updStep').textContent = reload ? 'Готово ✓ Перезапускаю апку…' : 'Готово ✓ Апка оновлена.';
  const wait = Math.max(900, 1200 - (Date.now() - shownAt));
  setTimeout(() => {
    if (reload) location.reload();
    else { open = false; $('updDlg').close(); reloading = false; }
  }, wait);
}
