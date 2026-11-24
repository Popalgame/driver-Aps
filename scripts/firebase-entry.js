// Точка входу для збірки SDK Firebase у site/vendor/firebase.js (npm run build:firebase).
// Беремо лише те, що потрібно апці — так файл менший.
export { initializeApp, deleteApp } from 'firebase/app';
export {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updateProfile,
  sendPasswordResetEmail, connectAuthEmulator,
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot,
} from 'firebase/firestore';
