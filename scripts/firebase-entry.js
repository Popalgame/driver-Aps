// Точка входу для збірки SDK Firebase у site/vendor/firebase.js (npm run build:firebase).
// Беремо лише те, що потрібно апці — так файл менший.
export { initializeApp } from 'firebase/app';
export {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, updateProfile,
  sendPasswordResetEmail, connectAuthEmulator,
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, getDoc, setDoc, deleteDoc, collection, query, where, onSnapshot,
} from 'firebase/firestore';
