// Конфіг Firebase для веб-апки.
// Де взяти: Firebase Console → ⚙ Project settings → General → Your apps → Web app → SDK setup → Config.
// Ці значення не секретні — доступ до даних захищають правила site/firestore.rules.
//
// Якщо поставити null — апка працюватиме лише локально (без входу й бази даних).
export const firebaseConfig = {
  apiKey: 'AIzaSyAOJxC4lVR3OIxbiSRf-COaEF8v3g9veeQ',
  authDomain: 'driver-aps.firebaseapp.com',
  projectId: 'driver-aps',
  storageBucket: 'driver-aps.firebasestorage.app',
  messagingSenderId: '514921198898',
  appId: '1:514921198898:web:45a8c1022129b0bad3d32b',
};
