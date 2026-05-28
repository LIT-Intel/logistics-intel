// Shared structured logger for Supabase edge functions.
//
// Why: every function currently uses ad-hoc `console.log("...")` with
// prefix-bracket strings. That makes filtering, alerting, and Sentry routing
// brittle. This helper emits one JSON line per event with stable keys so the
// log pipeline (Logflare / Datadog / Sentry / etc) can index them.
//
// Usage:
//   const log = createLogger("save-company");
//   log.info("started", { request_id, user_id });
//   log.warn("usage_limit_hit", { user_id, limit: 10 });
//   log.error("stripe_call_failed", { err: String(err), stripe_request_id });
//
// Output (single line, parseable):
//   {"ts":"2026-05-28T16:42:01.123Z","level":"info","fn":"save-company",
//    "event":"started","request_id":"...","user_id":"..."}

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
  const line = {
    ts: new Date().toISOString(),
    level,
    fn,
    event,
    ...base,
    ...(extra ?? {}),
  };
  const json = JSON.stringify(line);
  if (level === "error") console.error(json);
  else if (level === "warn") console.warn(json);
  else console.log(json);
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
