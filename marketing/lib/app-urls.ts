/**
 * Centralized app entry-point URLs. Marketing CTAs and the Nav link
 * here. Override defaults in Vercel env when the live app's auth
 * routes differ from the standard.
 *
 *   NEXT_PUBLIC_APP_URL          → base app origin (workspace + dashboard)
 *   NEXT_PUBLIC_APP_LOGIN_URL    → exact login URL
 *   NEXT_PUBLIC_APP_SIGNUP_URL   → exact signup URL
 *
 * Production routing (May 2026):
 *   - Marketing pages: logisticintel.com / www.logisticintel.com
 *   - Auth (login + signup): logisticintel.com/login + /signup
 *     (proxied or rewritten to the app's auth handler — wired at the
 *     Vercel/DNS layer, not in this codebase)
 *   - Workspace + dashboard: app.logisticintel.com
 *
 * CTAs intentionally point to logisticintel.com paths. The operator is
 * responsible for ensuring /login and /signup actually serve the auth UI
 * (typically via a Vercel rewrite that proxies them to the app project).
 */

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.logisticintel.com";
export const APP_LOGIN_URL =
  process.env.NEXT_PUBLIC_APP_LOGIN_URL || "https://logisticintel.com/login";
export const APP_SIGNUP_URL =
  process.env.NEXT_PUBLIC_APP_SIGNUP_URL || "https://logisticintel.com/signup";
