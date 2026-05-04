/**
 * Centralized app entry-point URLs. Marketing CTAs and the Nav link
 * here. Override defaults in Vercel env when the live app's auth
 * routes differ from the standard.
 *
 *   NEXT_PUBLIC_APP_URL          → base app origin (where /app/* lives)
 *   NEXT_PUBLIC_APP_LOGIN_URL    → exact login URL
 *   NEXT_PUBLIC_APP_SIGNUP_URL   → exact signup URL
 *
 * Production reality (May 2026): the LIT app lives at
 * app.logisticintel.com. The marketing site (logisticintel.com /
 * www.logisticintel.com) is THIS Next.js project. So /login and
 * /signup CTAs MUST point off-site to app.logisticintel.com — sending
 * them to www.logisticintel.com/login is a 404 because this site
 * doesn't render that route.
 *
 * Override `NEXT_PUBLIC_APP_LOGIN_URL` if your auth uses a different
 * path (e.g. `/auth/sign-in`).
 */

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.logisticintel.com";
export const APP_LOGIN_URL =
  process.env.NEXT_PUBLIC_APP_LOGIN_URL || `${APP_URL}/login`;
export const APP_SIGNUP_URL =
  process.env.NEXT_PUBLIC_APP_SIGNUP_URL || `${APP_URL}/signup`;
