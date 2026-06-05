// Deno test for _shared/logger.ts — verifies emit shape (JSON line, stable
// keys) and child-logger field merging.
//
// Run with: deno test supabase/functions/_shared/logger.test.ts

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createLogger, requestId } from "./logger.ts";

function captureConsole<T>(fn: () => T): { lines: string[]; result: T } {
  const lines: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (msg: string) => lines.push(msg);
  console.warn = (msg: string) => lines.push(msg);
  console.error = (msg: string) => lines.push(msg);
  try {
    const result = fn();
    return { lines, result };
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
}

Deno.test("createLogger emits one JSON line with stable keys", () => {
  const log = createLogger("test-fn", { request_id: "req-1" });
  const { lines } = captureConsole(() => {
    log.info("started", { user_id: "u-1" });
  });
  assertEquals(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assertEquals(parsed.fn, "test-fn");
  assertEquals(parsed.event, "started");
  assertEquals(parsed.level, "info");
  assertEquals(parsed.request_id, "req-1");
  assertEquals(parsed.user_id, "u-1");
  assertStringIncludes(parsed.ts, "T");
});

Deno.test("createLogger.error routes to console.error", () => {
  const log = createLogger("test-fn");
  const lines: string[] = [];
  const origError = console.error;
  console.error = (msg: string) => lines.push(msg);
  try {
    log.error("boom", { err: "kaboom" });
  } finally {
    console.error = origError;
  }
  assertEquals(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assertEquals(parsed.level, "error");
  assertEquals(parsed.err, "kaboom");
});

Deno.test("child logger merges base fields with new ones", () => {
  const root = createLogger("test-fn", { service: "lit" });
  const child = root.child({ request_id: "req-2", user_id: "u-2" });
  const { lines } = captureConsole(() => {
    child.warn("near_limit", { remaining: 1 });
  });
  const parsed = JSON.parse(lines[0]);
  assertEquals(parsed.service, "lit");
  assertEquals(parsed.request_id, "req-2");
  assertEquals(parsed.user_id, "u-2");
  assertEquals(parsed.remaining, 1);
});

Deno.test("requestId returns a short hex string", () => {
  const id = requestId();
  // First UUID segment is 8 hex chars.
  assertEquals(id.length, 8);
  assertEquals(/^[0-9a-f]{8}$/.test(id), true);
});
