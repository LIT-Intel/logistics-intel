// Supabase Auth Client - Replaces Firebase Auth
import { createClient, AuthError, Session, User } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let authClient: any = null;
let authError: Error | null = null;

try {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[LIT Auth] Supabase credentials not found. Auth will be disabled.');
    authError = new Error('Supabase credentials not configured');
  } else {
    authClient = createClient(supabaseUrl, supabaseAnonKey);
    console.info('[LIT Auth] Supabase auth client initialized successfully');
  }
} catch (error) {
  console.error('[LIT Auth] Failed to initialize Supabase auth client:', error);
  authError = error as Error;
}

export const auth = authClient;

// Email/Password Sign In
export async function signInWithEmailPassword(email: string, password: string) {
  if (!auth) throw new Error('Auth not configured');
  if (!email || !password) throw new Error('Email and password required');

  const { data, error } = await auth.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data.user;
}

// Email/Password Registration
export async function registerWithEmailPassword({
  fullName,
  email,
  password
}: {
  fullName?: string;
  email: string;
  password: string;
}) {
  if (!auth) throw new Error('Auth not configured');
  if (!email || !password) throw new Error('Email and password required');

  const { data, error } = await auth.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName || '',
        display_name: fullName || email.split('@')[0],
      },
    },
  });

  if (error) throw error;
  return data.user;
}

// Google OAuth Sign In
export async function signInWithGoogle() {
  if (!auth) throw new Error('Auth not configured');

  const { data, error } = await auth.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/app/dashboard`,
    },
  });

  if (error) throw error;
  return data;
}

// Microsoft OAuth Sign In
export async function signInWithMicrosoft() {
  if (!auth) throw new Error('Auth not configured');

  const { data, error } = await auth.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: `${window.location.origin}/app/dashboard`,
      scopes: 'email profile openid',
    },
  });

  if (error) throw error;
  return data;
}

// Listen to Auth State Changes
export function listenToAuth(callback: (user: User | null) => void) {
  if (!auth) {
    // Degrade gracefully: no auth → treat as signed out
    const t = setTimeout(() => callback(null), 0);
    return () => clearTimeout(t);
  }

  const { data: { subscription } } = auth.auth.onAuthStateChange(
    (_event: string, session: Session | null) => {
      callback(session?.user ?? null);
    }
  );

  return () => subscription.unsubscribe();
}

// Get Current User
export async function getCurrentUser() {
  if (!auth) return null;

  const { data: { user }, error } = await auth.auth.getUser();

  if (error) {
    console.error('[LIT Auth] Error getting current user:', error);
    return null;
  }

  return user;
}

// Get Current Session
export async function getCurrentSession() {
  if (!auth) return null;

  const { data: { session }, error } = await auth.auth.getSession();

  if (error) {
    console.error('[LIT Auth] Error getting session:', error);
    return null;
  }

  return session;
}

// Sign Out
export async function logout() {
  if (!auth) return;

  const { error } = await auth.auth.signOut();

  if (error) {
    console.error('[LIT Auth] Error signing out:', error);
    throw error;
  }
}

// Password Reset Request
export async function resetPassword(email: string) {
  if (!auth) throw new Error('Auth not configured');

  const { error } = await auth.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) throw error;
}

// Update Password
export async function updatePassword(newPassword: string) {
  if (!auth) throw new Error('Auth not configured');

  const { error } = await auth.auth.updateUser({
    password: newPassword,
  });

  if (error) throw error;
}

// Update User Profile
export async function updateProfile(updates: {
  full_name?: string;
  display_name?: string;
  avatar_url?: string;
}) {
  if (!auth) throw new Error('Auth not configured');

  const { error } = await auth.auth.updateUser({
    data: updates,
  });

  if (error) throw error;
}

// Legacy aliases for compatibility
export const loginWithGoogle = signInWithGoogle;
export const loginWithMicrosoft = signInWithMicrosoft;
export const loginWithEmailPassword = signInWithEmailPassword;
