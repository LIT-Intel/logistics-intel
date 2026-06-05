// Shared structured logger for Supabase edge functions.
//
// Why: every function previously used ad-hoc `console.log("...")` with
// prefix-bracket strings. That made filtering, alerting, and Sentry routing
// brittle. This helper emits one JSON line per event with stable keys so the
// log pipeline (Logflare / Datadog / Sentry / etc) can index them.
//
// Sentry integration: `error` and `warn` emits are automatically captured by
// Sentry when SENTRY_DSN is set (see _shared/sentry.ts). Fire-and-forget;
// never blocks the calling path. No-op when DSN is unset.
//
// Usage:
//   const log = createLogger("save-company");
//   log.info("started", { request_id, user_id });
//   log.warn("usage_limit_hit", { user_id, limit: 10 });
//   log.error("stripe_call_failed", { err: String(err), stripe_request_id });

import { captureSentryEvent } from "./sentry.ts";

type Level = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  /** Returns a child logger with extra fields baked into every emit. */
  child(extra: Record<string, unknown>): Logger;
}

function emit(level: Level, fn: string, base: Record<string, unknown>, event: string, extra?: Record<string, unknown>): void {
  const merged = { ...base, ...(extra ?? {}) };
  const line = {
    ts: new Date().toISOString(),
    level,
    fn,
    event,
    ...merged,
  };
  const json = JSON.stringify(line);
  if (level === "error") console.error(json);
  else if (level === "warn") console.warn(json);
  else console.log(json);

  // Sentry routing: error always; warn only when the fields include an `err`
  // shape (string or Error) — pure-info warns like "near_limit" don't need to
  // page anyone. Filtering policy lives here so it's the same for every fn.
  if (level === "error" || (level === "warn" && merged.err)) {
    captureSentryEvent({
      fn,
      event,
      fields: merged as Record<string, unknown>,
      error: merged.err,
      tags: {
        user_id: typeof merged.user_id === "string" ? merged.user_id : undefined,
        org_id: typeof merged.org_id === "string" ? merged.org_id : undefined,
        organization_id: typeof merged.organization_id === "string" ? merged.organization_id : undefined,
        request_id: typeof merged.request_id === "string" ? merged.request_id : undefined,
      },
    });
  }
}

export function createLogger(fn: string, base: Record<string, unknown> = {}): Logger {
  return {
    debug: (event, extra) => emit("debug", fn, base, event, extra),
    info: (event, extra) => emit("info", fn, base, event, extra),
    warn: (event, extra) => emit("warn", fn, base, event, extra),
    error: (event, extra) => emit("error", fn, base, event, extra),
    child: (extra) => createLogger(fn, { ...base, ...extra }),
  };
}

/** Generate a short request id for correlating log lines across one request. */
export function requestId(): string {
  return crypto.randomUUID().split("-")[0];
}
