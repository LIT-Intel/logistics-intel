// Sentry wire-up for Supabase edge functions.
//
// No-op when SENTRY_DSN is unset, so deploys without the env var continue
// to log to stdout via createLogger as before. When the env var is set,
// `captureSentryEvent` POSTs to the Sentry ingestion endpoint directly —
// no SDK install needed in the Deno runtime, no extra dependency size.
//
// The logger plugs this in automatically: every `log.error(...)` emit is
// also captured to Sentry when DSN is configured.
//
// Why direct HTTP instead of @sentry/deno:
// - Deno's edge-runtime cold-start budget is tight; a 100ms SDK init on
//   every invocation is real money on a busy webhook.
// - Direct HTTP also means zero new dependencies in the deploy bundle,
//   which keeps cold-start fast and the function size below Supabase's
//   2 MB limit comfortably.

const RAW_DSN = Deno.env.get("SENTRY_DSN") || "";
const ENVIRONMENT = Deno.env.get("SENTRY_ENV") || Deno.env.get("DENO_DEPLOYMENT_ID") ? "production" : "development";
const RELEASE = Deno.env.get("SENTRY_RELEASE") || Deno.env.get("DENO_DEPLOYMENT_ID") || undefined;

interface ParsedDsn {
  endpoint: string; // Full envelope endpoint URL
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  if (!dsn) return null;
  try {
    // DSN format: https://<publicKey>@<host>/<projectId>
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!projectId || !u.username) return null;
    return {
      endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
      publicKey: u.username,
    };
  } catch {
    return null;
  }
}

const PARSED = parseDsn(RAW_DSN);
const SENTRY_AUTH_HEADER = PARSED
  ? `Sentry sentry_version=7, sentry_key=${PARSED.publicKey}, sentry_client=lit-edge/1.0`
  : "";

export interface SentryEvent {
  /** Function name (createLogger fn). */
  fn: string;
  /** Short event name from the logger (e.g. "stripe_pm_lookup_failed"). */
  event: string;
  /** Structured fields the logger emitted. */
  fields?: Record<string, unknown>;
  /** When the original error was thrown, optional. */
  error?: unknown;
  /** Bag of tags to set on the event (user_id, org_id, request_id). */
  tags?: Record<string, string | undefined>;
}

/**
 * Send an event to Sentry. No-op when SENTRY_DSN is unset. Fire-and-forget
 * by design — never await this from a critical path; never let a Sentry
 * outage take down a real request.
 */
export function captureSentryEvent(input: SentryEvent): void {
  if (!PARSED) return;
  // Fire-and-forget — don't block the calling path waiting on Sentry.
  void postEvent(input);
}

async function postEvent(input: SentryEvent): Promise<void> {
  if (!PARSED) return;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const now = new Date().toISOString();

  // Pull a sensible error message + stack out of whatever the caller passed.
  let exceptionMessage: string | undefined;
  let exceptionStack: string | undefined;
  if (input.error instanceof Error) {
    exceptionMessage = input.error.message;
    exceptionStack = input.error.stack;
  } else if (typeof input.error === "string") {
    exceptionMessage = input.error;
  } else if (input.fields?.err && typeof input.fields.err === "string") {
    exceptionMessage = input.fields.err;
  }

  const tags: Record<string, string> = {
    fn: input.fn,
    event: input.event,
  };
  for (const [k, v] of Object.entries(input.tags ?? {})) {
    if (typeof v === "string") tags[k] = v;
  }

  const payload: Record<string, unknown> = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: ENVIRONMENT,
    release: RELEASE,
    logger: input.fn,
    message: { formatted: `${input.fn}: ${input.event}` },
    tags,
    extra: input.fields ?? {},
  };

  if (exceptionMessage) {
    payload.exception = {
      values: [
        {
          type: input.event,
          value: exceptionMessage,
          ...(exceptionStack ? { stacktrace: { frames: parseStack(exceptionStack) } } : {}),
        },
      ],
    };
  }

  const envelope =
    JSON.stringify({ event_id: eventId, sent_at: now }) +
    "\n" +
    JSON.stringify({ type: "event" }) +
    "\n" +
    JSON.stringify(payload);

  try {
    await fetch(PARSED.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": SENTRY_AUTH_HEADER,
      },
      body: envelope,
    });
  } catch {
    // Never let a Sentry outage take down a real edge function. Swallow.
  }
}

interface StackFrame {
  function?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

function parseStack(stack: string): StackFrame[] {
  // Lightweight stack parser — Sentry accepts more, but this is enough for
  // useful triage. Format: "at fnName (file:line:col)" or "at file:line:col".
  const lines = stack.split("\n").slice(1, 21); // first frame is the message; cap at 20
  const frames: StackFrame[] = [];
  for (const line of lines) {
    const m =
      /\s*at\s+(?:(\S+)\s+\()?([^):]+):(\d+):(\d+)\)?/.exec(line.trim()) ||
      /\s*at\s+([^:]+):(\d+):(\d+)/.exec(line.trim());
    if (!m) continue;
    if (m.length === 5) {
      frames.push({
        function: m[1] || undefined,
        filename: m[2],
        lineno: Number(m[3]),
        colno: Number(m[4]),
      });
    } else if (m.length === 4) {
      frames.push({
        filename: m[1],
        lineno: Number(m[2]),
        colno: Number(m[3]),
      });
    }
  }
  // Sentry expects frames in reverse order (oldest first).
  return frames.reverse();
}

export function isSentryEnabled(): boolean {
  return PARSED !== null;
}
