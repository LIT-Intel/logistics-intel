/**
 * Centralized app entry-point URLs. Marketing CTAs and the Nav link
 * here. Override the defaults in Vercel env if the live app uses
 * different routes.
 *
 *   NEXT_PUBLIC_APP_URL          → base origin (default: https://app.logisticintel.com)
 *   NEXT_PUBLIC_APP_LOGIN_URL    → exact login URL (default: ${APP_URL}/login)
 *   NEXT_PUBLIC_APP_SIGNUP_URL   → exact signup URL (default: ${APP_URL}/signup)
 */

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.logisticintel.com";
export const APP_LOGIN_URL = process.env.NEXT_PUBLIC_APP_LOGIN_URL || `${APP_URL}/login`;
export const APP_SIGNUP_URL = process.env.NEXT_PUBLIC_APP_SIGNUP_URL || `${APP_URL}/signup`;
