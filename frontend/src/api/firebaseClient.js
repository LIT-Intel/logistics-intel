import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyCHh99l2qi5XQHeWV0fh8FSGHriiIraT7s",
  authDomain: "logistics-intel.firebaseapp.com",
  projectId: "logistics-intel",
  storageBucket: "logistics-intel.firebasestorage.app",
  messagingSenderId: "187580267283",
  appId: "1:187580267283:web:9c6bc974f7048a96b178e6",
  measurementId: "G-BG53DJBNDP"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const functions = getFunctions(app, 'us-central1');

// Try to call a Cloud Function, otherwise return a fallback value
export const callOr = (name, fallback) => {
  return async (payload) => {
    try {
      const fn = httpsCallable(functions, name);
      const res = await fn(payload ?? {});
      return res?.data;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn(`[functions] ${name} failed, using fallback`, err);
      }
      // If fallback is a function, call it; otherwise return the value
      return typeof fallback === 'function' ? fallback(payload) : fallback;
    }
  };
};

// Simple callable without fallback (will throw if missing)
export const call = (name) => {
  const fn = httpsCallable(functions, name);
  return async (payload) => {
    const res = await fn(payload ?? {});
    return res?.data;
  };
};
