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

export async function initCloud() {
  fb = await import('../vendor/firebase.js');
  const app = fb.initializeApp(config);
  auth = fb.getAuth(app);
  // Локальний кеш: зміни зберігаються без інтернету і відправляються, коли зв'язок повернеться
  db = fb.initializeFirestore(app, {
    localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
  });
  if (useEmulator) {
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

// ---------- Вхід ----------

// cb(profile | null); profile = { uid, name, email, role }
// Профіль відстежується наживо: коли керівник підтвердить або закриє доступ,
// cb викликається знову (лише при зміні ролі).
let stopProfile = null;
export function onUser(cb) {
  return fb.onAuthStateChanged(auth, async (user) => {
    stopProfile?.();
    stopProfile = null;
    if (!user) return cb(null);
    const fallback = { uid: user.uid, name: user.displayName || user.email, email: user.email, role: 'pending' };
    try {
      await ensureProfile(user);
    } catch (e) {
      console.error(e);
      return cb({ ...fallback, error: e });
    }
    let lastRole = null;
    stopProfile = fb.onSnapshot(fb.doc(db, 'users', user.uid), (snap) => {
      if (!snap.exists()) return;
      const p = { uid: user.uid, ...snap.data() };
      if (p.role === lastRole) return;
      lastRole = p.role;
      cb(p);
    }, (e) => {
      // Після виходу слухач теж отримує помилку доступу — її ігноруємо
      if (auth.currentUser?.uid === user.uid) cb({ ...fallback, error: e });
    });
  });
}

async function ensureProfile(user) {
  const ref = fb.doc(db, 'users', user.uid);
  const snap = await fb.getDoc(ref);
  if (snap.exists()) return;
  const profile = {
    name: (user.displayName || (user.email || '').split('@')[0] || 'Водій').slice(0, 60),
    email: user.email || '',
    role: 'pending',
    createdAt: Date.now(),
  };
  await fb.setDoc(ref, profile);
}

// remember = true — лишатися в обліковому записі після закриття браузера;
// false — вихід, коли браузер закрито (чужий / спільний пристрій).
export async function signIn(email, password, remember = true) {
  await fb.setPersistence(auth, remember ? fb.browserLocalPersistence : fb.browserSessionPersistence);
  return fb.signInWithEmailAndPassword(auth, email, password);
}
export const resetPassword = (email) => fb.sendPasswordResetEmail(auth, email);
export const logout = () => fb.signOut(auth);

// ---------- Керівник: водії ----------

// Створює обліковий запис водія. Окремий екземпляр Firebase (у пам'яті),
// щоб керівник не вийшов зі свого облікового запису.
export async function createDriver(name, email, password) {
  const sec = fb.initializeApp(config, 'add-driver-' + Date.now());
  try {
    const secAuth = fb.initializeAuth(sec, { persistence: fb.inMemoryPersistence });
    if (useEmulator) fb.connectAuthEmulator(secAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const { user } = await fb.createUserWithEmailAndPassword(secAuth, email, password);
    await fb.updateProfile(user, { displayName: name });
    await fb.signOut(secAuth);
    // Профіль записує керівник (правила дозволяють йому лише роль 'driver')
    await fb.setDoc(fb.doc(db, 'users', user.uid), { name, email, role: 'driver', createdAt: Date.now() });
    return user.uid;
  } finally {
    await fb.deleteApp(sec);
  }
}

// role: 'driver' (підтвердити / відновити) або 'disabled' (закрити доступ)
export const setUserRole = (uid, role) => fb.updateDoc(fb.doc(db, 'users', uid), { role });

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

export function watchUsers(cb, onError) {
  return fb.onSnapshot(fb.collection(db, 'users'), (snap) => cb(snap.docs.map(fromDoc)), onError);
}

// Запис не чекаємо: без інтернету проміс завершиться лише після синхронізації,
// а onSnapshot покаже зміну одразу.
export function putShift(s) {
  const { id, ...data } = s;
  return fb.setDoc(fb.doc(db, 'shifts', id), { ...data, updatedAt: Date.now() });
}

export const removeShift = (id) => fb.deleteDoc(fb.doc(db, 'shifts', id));
