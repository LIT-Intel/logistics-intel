// Supabase Auth Client — Single browser-side instance
import { createClient, Session, User } from '@supabase/supabase-js';

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

// The ONE true browser-side Supabase client.
// All frontend code must import `supabase` from here (or via @/lib/supabase which re-exports it).
export const supabase = authClient;

// Legacy alias — keep existing imports that use `auth` working.
export const auth = authClient;

// ── Session-expiry resilience (2026-08-20) ──────────────────────────────────
// When a refresh-token grant definitively fails (400 "Invalid Refresh Token:
// Refresh Token Not Found" — e.g. token family revoked while the site was
// down), supabase-js drops the session and emits SIGNED_OUT. Previously the
// app silently swallowed that: components kept their mounted state, every
// RLS-gated query returned empty rows, and users saw a "working" app with no
// data. Now: if the user WAS authenticated (in this tab, or via a persisted
// session found at boot) and the sign-out was not user-initiated, we clear the
// stale local session and hard-redirect to /login with a friendly
// "session expired" notice. Anonymous/marketing/auth routes are never
// redirected, and /login itself is excluded, so no redirect loops.

const SESSION_EXPIRED_REASON = 'session_expired';

function findStoredSupabaseAuthKeys(): string[] {
  const keys: string[] = [];
  try {
    if (typeof window === 'undefined' || !window.localStorage) return keys;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      // supabase-js v2 persists the session under "sb-<project-ref>-auth-token"
      if (key && /^sb-.+-auth-token/.test(key)) keys.push(key);
    }
  } catch {
    // storage unavailable (private mode / SSR) — treat as no stored session
  }
  return keys;
}

// Snapshot BEFORE createClient's initialize() runs its recover+refresh, which
// removes the storage key when the refresh token turns out to be dead. This is
// how we know "this browser believed it was signed in" even when the very
// first event we see is a session-less SIGNED_OUT / INITIAL_SESSION.
const hadStoredSessionAtBoot = findStoredSupabaseAuthKeys().length > 0;

let wasAuthenticatedThisTab = false;
let intentionalSignOut = false;
let sessionExpiredRedirectFired = false;

// Only genuinely-authenticated app surfaces may force-redirect. Marketing
// pages, /login (+ its /app/login alias), /signup, /reset-password,
// /auth/callback, /accept-invite, etc. must never bounce an anonymous visitor.
function isProtectedAppPath(pathname: string): boolean {
  if (pathname === '/app/login') return false;
  return (
    pathname === '/app' ||
    pathname.startsWith('/app/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/onboarding'
  );
}

// Definitive refresh-token failure — NOT transient network errors (supabase-js
// retries those on its own; killing the session for them would sign users out
// on flaky wifi).
export function isRefreshTokenError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { code?: string; message?: string };
  const code = String(err.code || '');
  const message = String(err.message || '');
  return (
    code === 'refresh_token_not_found' ||
    code === 'refresh_token_already_used' ||
    /invalid refresh token/i.test(message) ||
    /refresh token not found/i.test(message)
  );
}

// Clear the dead local session and (only on authenticated app routes) redirect
// to /login with a friendly message. Full page navigation on purpose: it
// guarantees every mounted component's in-memory "authenticated" state is
// discarded rather than left rendering empty data.
export function handleSessionExpired() {
  if (typeof window === 'undefined' || sessionExpiredRedirectFired) return;

  // Remove any lingering sb-* auth keys so the client stops replaying a
  // doomed refresh (the repeated 400s seen in prod auth logs).
  try {
    for (const key of findStoredSupabaseAuthKeys()) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // best-effort
  }

  const path = window.location.pathname;
  if (!isProtectedAppPath(path)) return; // public/auth route — never redirect

  sessionExpiredRedirectFired = true;
  const next = encodeURIComponent(path + (window.location.search || ''));
  console.warn('[LIT Auth] Session expired (refresh token invalid) — redirecting to login');
  window.location.replace(`/login?reason=${SESSION_EXPIRED_REASON}&next=${next}`);
}

// Global watcher — registered once on the singleton client.
if (authClient) {
  authClient.auth.onAuthStateChange((event: string, session: Session | null) => {
    if (session) {
      // Any live session re-arms the watcher and clears the logout flag.
      wasAuthenticatedThisTab = true;
      intentionalSignOut = false;
      sessionExpiredRedirectFired = false;
      return;
    }

    // Session-less events. Two shapes of "refresh definitively failed":
    //   - SIGNED_OUT emitted mid-session when the auto-refresh gets a
    //     terminal AuthApiError (refresh_token_not_found), and
    //   - INITIAL_SESSION with NO session at boot even though storage held a
    //     persisted session (initialize() tried to recover it, the refresh
    //     failed, and supabase-js dropped it before telling us).
    const definitiveSignOut =
      event === 'SIGNED_OUT' ||
      (event === 'INITIAL_SESSION' && hadStoredSessionAtBoot);

    if (!definitiveSignOut) return;
    if (intentionalSignOut) return; // user clicked "Log out" — their flow handles navigation
    if (!wasAuthenticatedThisTab && !hadStoredSessionAtBoot) return; // never was signed in — anonymous visitor

    handleSessionExpired();
  });
}

export function isSupabaseAvailable(): boolean {
  return authClient !== null;
}

export function getSupabaseError(): Error | null {
  return authError;
}

// Email/Password Sign In
// captchaToken: when Supabase Auth "Attack Protection → CAPTCHA" is enabled it
// gates EVERY password-grant call (not just signup), so login must forward a
// Turnstile token too. Omitted when the env gate is off — login behaves as
// before.
export async function signInWithEmailPassword(email: string, password: string, captchaToken?: string) {
  if (!auth) throw new Error('Auth not configured');
  if (!email || !password) throw new Error('Email and password required');

  const { data, error } = await auth.auth.signInWithPassword({
    email,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (error) throw error;
  return data.user;
}

import { readAttribution } from '@/lib/attribution';

// Email/Password Registration
// Returns the full data object so callers can check data.session:
//   - data.session !== null  → email confirmation disabled; user is immediately signed in
//   - data.session === null  → confirmation email sent; user must click the link
export async function registerWithEmailPassword({
  fullName,
  company,
  email,
  password,
  emailRedirectTo,
  captchaToken,
}: {
  fullName?: string;
  company?: string;
  email: string;
  password: string;
  emailRedirectTo?: string;
  // Cloudflare Turnstile token (BOT SIGNUP DOOR-BLOCK). Optional: when the owner
  // has NOT provisioned VITE_TURNSTILE_SITE_KEY, the signup form never renders
  // the widget and this is undefined — signup behaves exactly as before. When a
  // key IS set, the form supplies a solved token here and GoTrue verifies it
  // (requires Supabase Auth → Attack Protection → CAPTCHA = Turnstile enabled).
  captchaToken?: string;
}) {
  if (!auth) throw new Error('Auth not configured');
  if (!email || !password) throw new Error('Email and password required');

  const attr = readAttribution();
  const { data, error } = await auth.auth.signUp({
    email,
    password,
    options: {
      // Only include captchaToken when present. Passing undefined is harmless,
      // but omitting it keeps the "no key set → unchanged behavior" guarantee
      // crystal clear.
      ...(captchaToken ? { captchaToken } : {}),
      data: {
        full_name: fullName || '',
        display_name: fullName || email.split('@')[0],
        // Company name captured at signup (mandatory in ModernSignupPage). The
        // DB triggers persist it to profiles.company_name and name the new
        // org after it (handle_new_user_profile / handle_new_user_org_bootstrap).
        ...(company ? { company } : {}),
        // Wizard removed 2026-08-06 — DB triggers provision everything at
        // signup. Kept true (not dropped) so legacy onboarding checks pass.
        onboarding_completed: true,
        // Attribution (2026-08-15 fix): the marketing site's rich
        // lit_first_touch / lit_last_touch cookies now flow through here.
        //   user_metadata.attribution      — flat legacy blob (utm_source/…),
        //                                     back-compat for existing readers.
        //   user_metadata.first_touch/…    — full rich snapshots (additive).
        // OAuth signups can't carry metadata here — AuthProvider backfills
        // them post-first-session.
        ...(attr?.attribution ? { attribution: attr.attribution } : {}),
        ...(attr?.first_touch ? { first_touch: attr.first_touch } : {}),
        ...(attr?.last_touch ? { last_touch: attr.last_touch } : {}),
      },
      emailRedirectTo:
        emailRedirectTo || `${window.location.origin}/auth/callback`,
    },
  });

  if (error) throw error;
  return data;
}

// Google OAuth Sign In
export async function signInWithGoogle(redirectPath = "/app/search") {
  if (!auth) throw new Error('Auth not configured');

  const appUrl =
    import.meta.env.VITE_APP_URL ||
    import.meta.env.VITE_PUBLIC_APP_URL ||
    "https://app.logisticintel.com";

  const cleanRedirectPath = redirectPath.startsWith("/")
    ? redirectPath
    : `/${redirectPath}`;

  const { data, error } = await auth.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(cleanRedirectPath)}`,
    },
  });

  if (error) throw error;
  return data;
}

// Microsoft OAuth Sign In
export async function signInWithMicrosoft(redirectPath = "/app/search") {
  if (!auth) throw new Error('Auth not configured');

  const appUrl =
    import.meta.env.VITE_APP_URL ||
    import.meta.env.VITE_PUBLIC_APP_URL ||
    "https://app.logisticintel.com";

  const cleanRedirectPath = redirectPath.startsWith("/")
    ? redirectPath
    : `/${redirectPath}`;

  const { data, error } = await auth.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(cleanRedirectPath)}`,
      scopes: 'email profile openid',
    },
  });

  if (error) throw error;
  return data;
}

// Listen to Auth State Changes
export function listenToAuth(callback: (user: User | null) => void) {
  if (!auth) {
    const t = setTimeout(() => callback(null), 0);
    return () => clearTimeout(t);
  }

  const {
    data: { subscription },
  } = auth.auth.onAuthStateChange((_event: string, session: Session | null) => {
    callback(session?.user ?? null);
  });

  return () => subscription.unsubscribe();
}

// Get Current User
export async function getCurrentUser() {
  if (!auth) return null;
  const { data: { user }, error } = await auth.auth.getUser();
  if (error) {
    console.error('[LIT Auth] Error getting current user:', error);
    // A dead refresh token surfacing here means the session is unrecoverable —
    // route through the expired-session flow instead of silently returning null.
    if (isRefreshTokenError(error)) handleSessionExpired();
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
    if (isRefreshTokenError(error)) handleSessionExpired();
    return null;
  }
  return session;
}

// Sign Out
export async function logout() {
  if (!auth) return;
  // Mark this SIGNED_OUT as user-initiated so the session-expiry watcher does
  // not treat it as a failed refresh and inject a "session expired" redirect.
  // Re-armed automatically on the next SIGNED_IN (see watcher above).
  intentionalSignOut = true;
  const { error } = await auth.auth.signOut();
  if (error) {
    console.error('[LIT Auth] Error signing out:', error);
    throw error;
  }
}

// Password Reset Request
// captchaToken required when Auth CAPTCHA protection is on (see sign-in note).
export async function resetPassword(email: string, captchaToken?: string) {
  if (!auth) throw new Error('Auth not configured');
  const { error } = await auth.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
    ...(captchaToken ? { captchaToken } : {}),
  });
  if (error) throw error;
}

// Update Password
export async function updatePassword(newPassword: string) {
  if (!auth) throw new Error('Auth not configured');
  const { error } = await auth.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Resend email confirmation (for users stuck at "Email not confirmed")
// captchaToken required when Auth CAPTCHA protection is on (see sign-in note).
export async function resendConfirmationEmail(email: string, captchaToken?: string) {
  if (!auth) throw new Error('Auth not configured');
  const { error } = await auth.auth.resend({
    type: 'signup',
    email,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (error) throw error;
}

// Update User Profile metadata
export async function updateProfile(updates: {
  full_name?: string;
  display_name?: string;
  avatar_url?: string;
}) {
  if (!auth) throw new Error('Auth not configured');
  const { error } = await auth.auth.updateUser({ data: updates });
  if (error) throw error;
}

// Legacy aliases for compatibility
export const loginWithGoogle = signInWithGoogle;
export const loginWithMicrosoft = signInWithMicrosoft;
export const loginWithEmailPassword = signInWithEmailPassword;
