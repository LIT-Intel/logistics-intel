// Sentry wire-up for the LIT app.
//
// Init is a no-op when VITE_SENTRY_DSN is unset, so dev / preview / local
// builds keep working without any config. Set the env var in production
// (and any staging surface where you want error capture) and `Sentry.captureException`
// + the React ErrorBoundary start routing to your Sentry project.
//
// Sample rates are tuned for a moderate-traffic SaaS — adjust based on
// your Sentry plan.
import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN || "";
const ENV = import.meta.env.VITE_SENTRY_ENV || import.meta.env.MODE || "development";
// Release tag — keep in sync with the value the Sentry Vite plugin uploaded
// source maps under (sourced from VITE_SENTRY_RELEASE / VERCEL_GIT_COMMIT_SHA
// in vite.config.ts), otherwise stack traces won't resolve to original files.
const RELEASE = import.meta.env.VITE_SENTRY_RELEASE || "";

let initialized = false;

export function initSentry(): boolean {
  if (initialized) return true;
  if (!DSN) {
    // Silent no-op — keeps local dev quiet and avoids accidental capture
    // when devs forget to unset the env var.
    return false;
  }

  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: RELEASE || undefined,
    // Performance + replay sampling. Crank these up only after you've
    // monitored quota for a billing cycle.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
    // Don't capture noisy framework errors that aren't actionable.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      // Auth-required toast-then-redirect flows surface this in dev.
      "No active Supabase session",
    ],
    beforeSend(event) {
      // Strip Authorization headers from breadcrumbs in case any leaked in.
      if (event.request?.headers) {
        delete (event.request.headers as Record<string, unknown>).Authorization;
        delete (event.request.headers as Record<string, unknown>).authorization;
      }
      return event;
    },
  });

  initialized = true;
  return true;
}

/**
 * Tag the active Sentry scope with the current user + org. Call from
 * AuthProvider whenever the session refreshes; the tags propagate to every
 * subsequent event capture.
 */
export function identifySentryUser(args: {
  user_id?: string | null;
  email?: string | null;
  org_id?: string | null;
  plan?: string | null;
}): void {
  if (!initialized) return;
  Sentry.setUser({
    id: args.user_id ?? undefined,
    email: args.email ?? undefined,
  });
  if (args.org_id) Sentry.setTag("org_id", args.org_id);
  if (args.plan) Sentry.setTag("plan", args.plan);
}

export function clearSentryUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}

/** Re-export the ErrorBoundary so callers don't import @sentry/react directly. */
export const SentryErrorBoundary = Sentry.ErrorBoundary;
export { Sentry };
