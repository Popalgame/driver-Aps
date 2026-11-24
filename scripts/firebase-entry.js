// Точка входу для збірки SDK Firebase у site/vendor/firebase.js (npm run build:firebase).
// Беремо лише те, що потрібно апці — так файл менший.
export { initializeApp, deleteApp } from 'firebase/app';
export {
  getAuth, initializeAuth, inMemoryPersistence, browserLocalPersistence, browserSessionPersistence, setPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updateProfile,
  sendPasswordResetEmail, connectAuthEmulator, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot,
} from 'firebase/firestore';
