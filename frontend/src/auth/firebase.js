// frontend/src/firebase.ts
import { initializeApp, getApps } from 'firebase/app';
// If you use auth/analytics/firestore etc, import them where needed.

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

for (const [k, v] of Object.entries(firebaseConfig)) {
  if (!v) {
    // Fail fast with a helpful message
    // eslint-disable-next-line no-console
    console.error('Firebase config missing:', k);
    throw new Error('Firebase config is incomplete. Check your .env files.');
  }
}

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
