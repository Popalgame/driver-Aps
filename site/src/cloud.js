// Firebase: вхід, профіль користувача і зміни у Firestore.
//
// Колекції:
//   users/{uid}   { name, email, role: 'pending' | 'driver' | 'disabled' | 'manager', createdAt }
//   shifts/{id}   { uid, driverName, start, end|null, breaks: [{start, end|null}], note, updatedAt }
// Час — у мілісекундах. Реєстрації немає: водіїв додає керівник (createDriver).
// Хто увійшов без профілю, отримує роль 'pending' і чекає підтвердження керівника.
// Першу роль 'manager' призначають вручну в Firebase Console.
import { firebaseConfig } from './firebase-config.js';

const params = new URLSearchParams(location.search);
// Локальна розробка з емулятором: http://localhost:5173/?emulator
const useEmulator = ['localhost', '127.0.0.1'].includes(location.hostname) && params.has('emulator');

const config = useEmulator
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-driver-aps', appId: 'demo' }
  : firebaseConfig;

export const cloudEnabled = !!config;

let fb, auth, db;

let readyResolve;
const ready = new Promise((r) => { readyResolve = r; });
// Чекати, поки Firebase завантажиться (для дій, які користувач може натиснути одразу після старту)
export const whenReady = () => ready;

export async function initCloud() {
  fb = await import('../vendor/firebase.js');
  const app = fb.initializeApp(config);
  // Без модуля входу через Google/перенаправлень (getAuth його підключає й чекає на нього при старті)
  auth = fb.initializeAuth(app, {
    persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence, fb.browserSessionPersistence],
  });
  // Локальний кеш: зміни зберігаються без інтернету і відправляються, коли зв'язок повернеться
  db = fb.initializeFirestore(app, {
    localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
  });
  if (useEmulator) {
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  readyResolve();
}

// ---------- Вхід ----------

// cb(profile | null); profile = { uid, name, email, role }
// Профіль відстежується наживо: коли керівник підтвердить або закриє доступ,
// cb викликається знову (лише при зміні ролі).
let stopProfile = null;
export function onUser(cb) {
  return fb.onAuthStateChanged(auth, (user) => {
    stopProfile?.();
    stopProfile = null;
    if (!user) return cb(null);
    const fallback = { uid: user.uid, name: user.displayName || user.email, email: user.email, role: 'pending' };
    let lastRole = null;
    let creating = false;
    // Профіль одразу з пам'яті телефона (без очікування сервера); сервер підтвердить у фоні.
    // Якщо за 10 с відповіді немає зовсім (перший вхід без інтернету) — показуємо помилку.
    const slow = setTimeout(() => { if (lastRole === null) cb({ ...fallback, error: new Error('offline') }); }, 10000);
    stopProfile = fb.onSnapshot(fb.doc(db, 'users', user.uid), (snap) => {
      if (!snap.exists()) {
        // Профілю ще немає: створюємо «очікує підтвердження», але лише коли сервер це підтвердив
        if (snap.metadata.fromCache || creating) return;
        creating = true;
        createProfile(user).catch((e) => { console.error(e); cb({ ...fallback, error: e }); });
        return;
      }
      clearTimeout(slow);
      const p = { uid: user.uid, ...snap.data() };
      if (p.role === lastRole) return;
      lastRole = p.role;
      cb(p);
    }, (e) => {
      clearTimeout(slow);
      // Після виходу слухач теж отримує помилку доступу — її ігноруємо
      if (auth.currentUser?.uid === user.uid) cb({ ...fallback, error: e });
    });
  });
}

function createProfile(user) {
  return fb.setDoc(fb.doc(db, 'users', user.uid), {
    name: (user.displayName || (user.email || '').split('@')[0] || 'Водій').slice(0, 60),
    email: user.email || '',
    role: 'pending',
    createdAt: Date.now(),
  });
}

export async function signIn(email, password, remember = true) {
  await fb.setPersistence(auth, remember ? fb.browserLocalPersistence : fb.browserSessionPersistence);
  return fb.signInWithEmailAndPassword(auth, email, password);
}
export const resetPassword = (email) => fb.sendPasswordResetEmail(auth, email);

// ---------- Налаштування профілю ----------
export async function updateMyName(uid, name) {
  await ready;
  return fb.updateDoc(fb.doc(db, 'users', uid), { name });
}

// Firebase вимагає недавнього входу — спершу перевіряємо поточний пароль
export async function changePassword(current, next) {
  await ready;
  const u = auth.currentUser;
  if (!u) throw new Error('Не виконано вхід');
  await fb.reauthenticateWithCredential(u, fb.EmailAuthProvider.credential(u.email, current));
  await fb.updatePassword(u, next);
}
export const logout = () => fb.signOut(auth);

// ---------- Керівник: водії ----------

// Створює обліковий запис водія. Окремий екземпляр Firebase (у пам'яті),
// щоб керівник не вийшов зі свого облікового запису.
// role: 'driver' або 'hr' (кадри; у профілі ще kind: 'hr')
export async function createDriver(name, email, password, role = 'driver') {
  await ready;
  const sec = fb.initializeApp(config, 'add-driver-' + Date.now());
  try {
    const secAuth = fb.initializeAuth(sec, { persistence: fb.inMemoryPersistence });
    if (useEmulator) fb.connectAuthEmulator(secAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const { user } = await fb.createUserWithEmailAndPassword(secAuth, email, password);
    await fb.updateProfile(user, { displayName: name });
    await fb.signOut(secAuth);
    // Профіль записує керівник (правила дозволяють йому лише роль 'driver')
    const prof = { name, email, role, createdAt: Date.now() };
    if (role === 'hr') prof.kind = 'hr';
    await fb.setDoc(fb.doc(db, 'users', user.uid), prof);
    return user.uid;
  } finally {
    await fb.deleteApp(sec);
  }
}

// role: 'driver' (підтвердити / відновити) або 'disabled' (закрити доступ)
export async function setUserRole(uid, role) {
  await ready;
  return fb.updateDoc(fb.doc(db, 'users', uid), { role });
}

export function authError(e) {
  const map = {
    'auth/invalid-email': 'Невірний формат email.',
    'auth/missing-password': 'Введи пароль.',
    'auth/weak-password': 'Пароль має бути щонайменше 6 символів.',
    'auth/email-already-in-use': 'Обліковий запис з таким email уже існує.',
    'auth/invalid-credential': 'Невірний email або пароль.',
    'auth/wrong-password': 'Невірний email або пароль.',
    'auth/user-not-found': 'Невірний email або пароль.',
    'auth/too-many-requests': 'Забагато спроб. Спробуй трохи пізніше.',
    'auth/network-request-failed': 'Немає інтернету. Для входу потрібне з\'єднання.',
    'auth/popup-closed-by-user': 'Вхід скасовано.',
    'auth/configuration-not-found': 'Вхід ще не увімкнено: Firebase Console → Authentication → Get started.',
    'auth/operation-not-allowed': 'Цей спосіб входу вимкнено: Firebase Console → Authentication → Sign-in method.',
    'auth/unauthorized-domain': 'Цей домен не дозволено: Authentication → Settings → Authorized domains.',
  };
  return map[e?.code] || 'Помилка: ' + (e?.message || e);
}

// ---------- Зміни ----------

const fromDoc = (d) => ({ id: d.id, ...d.data() });

// Зміни одного водія (без складених індексів — сортуємо на клієнті)
export function watchMyShifts(uid, cb, onError) {
  const q = fb.query(fb.collection(db, 'shifts'), fb.where('uid', '==', uid));
  return fb.onSnapshot(q, (snap) => cb(snap.docs.map(fromDoc)), onError);
}

// Для керівника: усі зміни, що почалися в [from, to)
export function watchAllShifts(from, to, cb, onError) {
  const q = fb.query(fb.collection(db, 'shifts'), fb.where('start', '>=', from), fb.where('start', '<', to));
  return fb.onSnapshot(q, (snap) => cb(snap.docs.map(fromDoc)), onError);
}

// Можна викликати ще до завантаження Firebase (швидкий старт) — підпишеться, коли буде готово
export function watchUsers(cb, onError) {
  return watchWhenReady(() => fb.onSnapshot(fb.collection(db, 'users'), (snap) => cb(snap.docs.map(fromDoc)), onError));
}

// Запис не чекаємо: без інтернету проміс завершиться лише після синхронізації,
// а onSnapshot покаже зміну одразу.
export function putShift(s) {
  const { id, ...data } = s;
  return fb.setDoc(fb.doc(db, 'shifts', id), { ...data, updatedAt: Date.now() });
}

export const removeShift = (id) => fb.deleteDoc(fb.doc(db, 'shifts', id));

// ---------- Кілометраж і заправки ----------
// mileage/{id} { uid, type: 'odo' | 'fuel', at, km, liters, amount, note, updatedAt }
export function watchMileage(uid, cb, onError) {
  let stop = null, cancelled = false;
  ready.then(() => {
    if (cancelled) return;
    const q = fb.query(fb.collection(db, 'mileage'), fb.where('uid', '==', uid));
    stop = fb.onSnapshot(q, (snap) => cb(snap.docs.map(fromDoc)), onError);
  });
  return () => { cancelled = true; stop?.(); };
}

// Як і зі змінами: не чекаємо сервера — onSnapshot покаже запис одразу
export async function putMileage(uid, e) {
  await ready;
  const { id, ...data } = e;
  return fb.setDoc(fb.doc(db, 'mileage', id), { ...data, uid, updatedAt: Date.now() });
}

export async function removeMileage(id) {
  await ready;
  return fb.deleteDoc(fb.doc(db, 'mileage', id));
}

// Для керівника: записи всіх водіїв за [from, to)
export function watchAllMileage(from, to, cb, onError) {
  let stop = null, cancelled = false;
  ready.then(() => {
    if (cancelled) return;
    const q = fb.query(fb.collection(db, 'mileage'), fb.where('at', '>=', from), fb.where('at', '<', to));
    stop = fb.onSnapshot(q, (snap) => cb(snap.docs.map(fromDoc)), onError);
  });
  return () => { cancelled = true; stop?.(); };
}

// ---------- Проєкти й календар ----------
// projects/{pid} { name, members: [uid], names: {uid: ім'я}, color, createdAt, updatedAt }
// events/{id}    { project, date: 'РРРР-ММ-ДД', time: 'ГГ:ХХ' | '', title, people|null, note, by, byName, createdAt, updatedAt }
function watchWhenReady(make) {
  let stop = null, cancelled = false;
  ready.then(() => { if (!cancelled) stop = make(); });
  return () => { cancelled = true; stop?.(); };
}

// Керівник — усі проєкти; водій — ті, де він у members; кадри — де вона в hr
export function watchProjects(uid, role, cb, onError) {
  return watchWhenReady(() => {
    const col = fb.collection(db, 'projects');
    const q = role === 'manager' ? col : fb.query(col, fb.where(role === 'hr' ? 'hr' : 'members', 'array-contains', uid));
    return fb.onSnapshot(q, (snap) => cb(snap.docs.map(fromDoc)), onError);
  });
}

export async function putProject(p) {
  await ready;
  const { id, ...data } = p;
  return fb.setDoc(fb.doc(db, 'projects', id), { ...data, updatedAt: Date.now() });
}

// Разом із проєктом видаляються і його події
export async function removeProject(id) {
  await ready;
  const evs = await fb.getDocs(fb.query(fb.collection(db, 'events'), fb.where('project', '==', id)));
  const batch = fb.writeBatch(db);
  for (const d of evs.docs) batch.delete(d.ref);
  batch.delete(fb.doc(db, 'projects', id));
  return batch.commit();
}

// Керівник — усі події; водій — події своїх проєктів (окремий запит на кожен проєкт)
export function watchEvents(projectIds, all, cb, onError) {
  return watchWhenReady(() => {
    const col = fb.collection(db, 'events');
    if (all) return fb.onSnapshot(col, (snap) => cb(snap.docs.map(fromDoc)), onError);
    const parts = new Map();
    const emit = () => cb([...parts.values()].flat());
    const stops = projectIds.map((pid) => fb.onSnapshot(fb.query(col, fb.where('project', '==', pid)), (snap) => {
      parts.set(pid, snap.docs.map(fromDoc));
      emit();
    }, onError));
    if (!projectIds.length) cb([]);
    return () => stops.forEach((s) => s());
  });
}

export async function putEvent(e) {
  await ready;
  const { id, ...data } = e;
  return fb.setDoc(fb.doc(db, 'events', id), { ...data, updatedAt: Date.now() });
}

// Часткова зміна події (кроки завдання: беру / в дорозі / виконано) — не чіпає решту полів
export async function patchEvent(id, patch) {
  await ready;
  return fb.updateDoc(fb.doc(db, 'events', id), { ...patch, updatedAt: Date.now() });
}

export async function removeEvent(id) {
  await ready;
  return fb.deleteDoc(fb.doc(db, 'events', id));
}
