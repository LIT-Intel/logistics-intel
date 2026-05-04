/**
 * Centralized app entry-point URLs. Marketing CTAs and the Nav link
 * here. Override defaults in Vercel env when the live app's auth
 * routes differ from the standard.
 *
 *   NEXT_PUBLIC_APP_URL          → base app origin (where /app/* lives)
 *   NEXT_PUBLIC_APP_LOGIN_URL    → exact login URL (with optional ?next= redirect)
 *   NEXT_PUBLIC_APP_SIGNUP_URL   → exact signup URL
 *
 * Production reality (May 2026): the auth routes for the LIT app live on
 * the marketing apex `www.logisticintel.com/login?next=/app/dashboard`,
 * NOT on a subdomain. Defaults reflect this. The `app.logisticintel.com`
 * subdomain is reserved for the in-app workspace itself.
 */

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.logisticintel.com";
export const APP_LOGIN_URL =
  process.env.NEXT_PUBLIC_APP_LOGIN_URL ||
  "https://www.logisticintel.com/login?next=/app/dashboard";
export const APP_SIGNUP_URL =
  process.env.NEXT_PUBLIC_APP_SIGNUP_URL ||
  "https://www.logisticintel.com/login?next=/app/dashboard";
