// Firebase: вхід, профіль користувача і зміни у Firestore.
//
// Колекції:
//   users/{uid}   { name, email, role: 'driver' | 'manager', createdAt }
//   shifts/{id}   { uid, driverName, start, end|null, breaks: [{start, end|null}], note, updatedAt }
// Час — у мілісекундах. Роль 'manager' призначається вручну в Firebase Console.
import { firebaseConfig } from './firebase-config.js';

const params = new URLSearchParams(location.search);
// Локальна розробка з емулятором: http://localhost:5173/?emulator
const useEmulator = ['localhost', '127.0.0.1'].includes(location.hostname) && params.has('emulator');

const config = useEmulator
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-driver-aps', appId: 'demo' }
  : firebaseConfig;

export const cloudEnabled = !!config;

let fb, auth, db;
let pendingName = ''; // ім'я з форми реєстрації — для першого профілю

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
export function onUser(cb) {
  return fb.onAuthStateChanged(auth, async (user) => {
    if (!user) return cb(null);
    try {
      cb(await ensureProfile(user));
    } catch (e) {
      console.error(e);
      cb({ uid: user.uid, name: user.displayName || user.email, email: user.email, role: 'driver', error: e });
    }
  });
}

async function ensureProfile(user) {
  const ref = fb.doc(db, 'users', user.uid);
  const snap = await fb.getDoc(ref);
  if (snap.exists()) return { uid: user.uid, ...snap.data() };
  const profile = {
    name: (pendingName || user.displayName || (user.email || '').split('@')[0] || 'Водій').slice(0, 60),
    email: user.email || '',
    role: 'driver',
    createdAt: Date.now(),
  };
  await fb.setDoc(ref, profile);
  return { uid: user.uid, ...profile };
}

export async function register(name, email, password) {
  // Профіль у users/ створює onUser → ensureProfile; ім'я передаємо через pendingName,
  // бо onAuthStateChanged спрацьовує раніше, ніж встигне updateProfile.
  pendingName = name;
  try {
    const { user } = await fb.createUserWithEmailAndPassword(auth, email, password);
    await fb.updateProfile(user, { displayName: name });
  } finally {
    setTimeout(() => { pendingName = ''; }, 5000);
  }
}

export const signIn = (email, password) => fb.signInWithEmailAndPassword(auth, email, password);
export const resetPassword = (email) => fb.sendPasswordResetEmail(auth, email);
export const logout = () => fb.signOut(auth);

export async function googleSignIn() {
  const provider = new fb.GoogleAuthProvider();
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await fb.signInWithRedirect(auth, provider);
    } else throw e;
  }
}

export function authError(e) {
  const map = {
    'auth/invalid-email': 'Невірний формат email.',
    'auth/missing-password': 'Введи пароль.',
    'auth/weak-password': 'Пароль має бути щонайменше 6 символів.',
    'auth/email-already-in-use': 'Такий email уже зареєстровано — увійди.',
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
