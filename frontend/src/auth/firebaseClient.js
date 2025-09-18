// frontend/src/auth/firebaseClient.js
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = !!(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

let authInstance = null;
try {
  if (hasFirebaseConfig) {
    const app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
  } else {
    if (import.meta.env.PROD) {
      console.warn("Firebase config missing; auth disabled in this environment.");
    }
  }
} catch (e) {
  console.error("Failed to initialize Firebase:", e);
}

export const auth = authInstance;

export async function signInWithGoogle() {
  if (!auth) throw new Error("Auth not configured");
  const provider = new GoogleAuthProvider();
  try {
    return await signInWithPopup(auth, provider);
  } catch (e) {
    // Fallback to redirect for popup/cookie/ITP issues or domain errors
    await signInWithRedirect(auth, provider);
    return { ok: true, redirect: true };
  }
}

export function listenToAuth(callback) {
  if (!auth) {
    // Degrade gracefully: no auth → treat as signed out
    const t = setTimeout(() => callback(null), 0);
    return () => clearTimeout(t);
  }
  return onAuthStateChanged(auth, callback);
}

export function logout() {
  if (!auth) return Promise.resolve();
  return signOut(auth);
}

// Existing alias for Google
export { signInWithGoogle as loginWithGoogle };

// ✅ NEW: Microsoft sign-in
export async function signInWithMicrosoft() {
  if (!auth) throw new Error("Auth not configured");
  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({ prompt: "consent" });
  try {
    return await signInWithPopup(auth, provider);
  } catch (e) {
    await signInWithRedirect(auth, provider);
    return { ok: true, redirect: true };
  }
}

// Alias to match our UI naming
export { signInWithMicrosoft as loginWithMicrosoft };

// Email/password login
export async function loginWithEmailPassword(email, password) {
  if (!auth) throw new Error("Auth not configured");
  if (!email || !password) throw new Error("Email and password required");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred?.user || null;
}

// Email/password registration with verification
export async function registerWithEmailPassword({ fullName, email, password }) {
  if (!auth) throw new Error("Auth not configured");
  if (!email || !password) throw new Error("Email and password required");
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (fullName) {
    try { await updateProfile(cred.user, { displayName: fullName }); } catch {}
  }
  try { await sendEmailVerification(cred.user); } catch {}
  return cred?.user || null;
}
