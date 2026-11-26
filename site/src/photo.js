// Фото людей: маленьке квадратне JPEG (160×160) прямо в профілі (users/{uid}.photo) —
// без окремого сховища файлів. Де фото немає — перша літера імені.
export const PHOTO_SIZE = 160;
export const MAX_PHOTO = 40000; // символів data:URL (~30 КБ); зазвичай виходить 8–15 КБ

// Вікно редагування: наблизити (повзунок або два пальці), посунути пальцем/мишкою, повернути.
// Повертає data:image/jpeg;base64,… або null («Скасувати»).
export async function photoFromFile(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Вибери фото (JPG, PNG…).');
  const img = await loadImage(file);
  return editPhoto(img);
}

const $ = (id) => document.getElementById(id);
const VIEW = 280; // розмір вікна перегляду, px

function editPhoto(img) {
  return new Promise((resolve) => {
    const cv = $('phCanvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = VIEW * dpr;
    const ctx = cv.getContext('2d');
    let rot = 0, zoom = 1, x = 0, y = 0; // зсув центру фото відносно центру кола, px вікна
    const dims = () => (rot % 2 ? [img.height, img.width] : [img.width, img.height]);
    const base = () => { const [w, h] = dims(); return VIEW / Math.min(w, h); }; // фото покриває коло
    const clamp = () => {
      const [w, h] = dims(); const k = base() * zoom;
      const mx = Math.max(0, (w * k - VIEW) / 2), my = Math.max(0, (h * k - VIEW) / 2);
      x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
    };
    const draw = (c, size, scale) => {
      c.save();
      c.fillStyle = '#0e2250'; c.fillRect(0, 0, size, size);
      c.translate(size / 2 + x * scale, size / 2 + y * scale);
      c.rotate(rot * Math.PI / 2);
      const k = base() * zoom * scale;
      c.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
      c.restore();
    };
    const render = () => { clamp(); ctx.setTransform(1, 0, 0, 1, 0, 0); draw(ctx, cv.width, dpr); };

    $('phZoom').value = '1';
    $('phZoom').oninput = () => { zoom = Number($('phZoom').value); render(); };
    $('phRotate').onclick = () => { rot = (rot + 1) % 4; x = y = 0; render(); };
    // Посунути: один палець / мишка; наблизити: два пальці або коліщатко
    const pts = new Map(); let last = null, pinch = null;
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, e); last = e; };
    cv.onpointermove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch) { zoom = Math.min(4, Math.max(1, zoom * d / pinch)); $('phZoom').value = String(zoom); }
        pinch = d;
      } else if (last) {
        const r = cv.getBoundingClientRect(), s = VIEW / r.width;
        x += (e.clientX - last.clientX) * s; y += (e.clientY - last.clientY) * s;
        last = e;
      }
      render();
    };
    cv.onpointerup = cv.onpointercancel = (e) => { pts.delete(e.pointerId); pinch = null; last = pts.size ? [...pts.values()][0] : null; };
    cv.onwheel = (e) => { e.preventDefault(); zoom = Math.min(4, Math.max(1, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); $('phZoom').value = String(zoom); render(); };

    const done = (val) => { $('phDlg').close(); resolve(val); };
    $('phCancel').onclick = () => done(null);
    $('phDlg').oncancel = (e) => { e.preventDefault(); done(null); };
    $('phSave').onclick = () => {
      const out = document.createElement('canvas');
      out.width = out.height = PHOTO_SIZE;
      draw(out.getContext('2d'), PHOTO_SIZE, PHOTO_SIZE / VIEW);
      for (const q of [0.85, 0.75, 0.6, 0.45]) {
        const url = out.toDataURL('image/jpeg', q);
        if (url.length <= MAX_PHOTO) return done(url);
      }
      done(null);
    };
    $('phDlg').showModal();
    render();
  });
}

function loadImage(file) {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('Не вдалося відкрити фото.')); };
    img.src = url;
  });
}

export const isPhoto = (p) => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,') && p.length <= MAX_PHOTO;

// Кружечок: фото або перша літера
export function setAvatar(node, name, photo) {
  const ok = isPhoto(photo);
  node.classList.toggle('has-photo', ok);
  node.style.backgroundImage = ok ? `url("${photo}")` : '';
  node.textContent = ok ? '' : ((name || '•').trim().charAt(0).toUpperCase() || '•');
}

export function avatarEl(name, photo, cls = '') {
  const d = document.createElement('div');
  d.className = 'avatar' + (cls ? ' ' + cls : '');
  setAvatar(d, name, photo);
  return d;
}
