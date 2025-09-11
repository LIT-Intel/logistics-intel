// frontend/src/auth/firebaseClient.js
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,            // ⬅️ add this
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export function listenToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function logout() {
  return signOut(auth);
}

// Existing alias for Google
export { signInWithGoogle as loginWithGoogle };

// ✅ NEW: Microsoft sign-in
export async function signInWithMicrosoft() {
  const provider = new OAuthProvider("microsoft.com");
  // optional but helps avoid stale sessions and ensures email scope
  provider.setCustomParameters({ prompt: "consent" });
  return signInWithPopup(auth, provider);
}

// Alias to match our UI naming
export { signInWithMicrosoft as loginWithMicrosoft };
