// supabase/functions/_shared/outreach-throttle.test.ts
import { computeDailyCap } from "./outreach-throttle.ts";

const DAY_MS = 86400000;

Deno.test("computeDailyCap — null warmupStartedAt + warmupComplete=false uses base cap (treats as never started)", () => {
  const cap = computeDailyCap({
    now: new Date("2026-05-20T12:00:00Z"),
    warmupStartedAt: null,
    warmupComplete: false,
    dailySendCap: 50,
  });
  if (cap !== 50) throw new Error(`expected 50, got ${cap}`);
});

Deno.test("computeDailyCap — warmupComplete=true uses dailySendCap as ceiling", () => {
  const cap = computeDailyCap({
    now: new Date("2026-05-20T12:00:00Z"),
    warmupStartedAt: new Date("2026-05-19T12:00:00Z"),
    warmupComplete: true,
    dailySendCap: 200,
  });
  if (cap !== 200) throw new Error(`expected 200, got ${cap}`);
});

Deno.test("computeDailyCap — day 1-3 of warmup returns 10", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  for (const day of [0, 1, 2]) {
    const cap = computeDailyCap({
      now: new Date(start.getTime() + day * DAY_MS),
      warmupStartedAt: start,
      warmupComplete: false,
      dailySendCap: 50,
    });
    if (cap !== 10) throw new Error(`day ${day + 1}: expected 10, got ${cap}`);
  }
});

Deno.test("computeDailyCap — day 4-7 returns 25", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  for (const day of [3, 4, 5, 6]) {
    const cap = computeDailyCap({
      now: new Date(start.getTime() + day * DAY_MS),
      warmupStartedAt: start,
      warmupComplete: false,
      dailySendCap: 50,
    });
    if (cap !== 25) throw new Error(`day ${day + 1}: expected 25, got ${cap}`);
  }
});

Deno.test("computeDailyCap — day 8-14 returns 50", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  for (const day of [7, 10, 13]) {
    const cap = computeDailyCap({
      now: new Date(start.getTime() + day * DAY_MS),
      warmupStartedAt: start,
      warmupComplete: false,
      dailySendCap: 50,
    });
    if (cap !== 50) throw new Error(`day ${day + 1}: expected 50, got ${cap}`);
  }
});

Deno.test("computeDailyCap — day 15-21 returns 100", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  const cap = computeDailyCap({
    now: new Date(start.getTime() + 18 * DAY_MS),
    warmupStartedAt: start,
    warmupComplete: false,
    dailySendCap: 200,
  });
  if (cap !== 100) throw new Error(`expected 100, got ${cap}`);
});

Deno.test("computeDailyCap — day 22-30 returns 150", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  const cap = computeDailyCap({
    now: new Date(start.getTime() + 25 * DAY_MS),
    warmupStartedAt: start,
    warmupComplete: false,
    dailySendCap: 200,
  });
  if (cap !== 150) throw new Error(`expected 150, got ${cap}`);
});

Deno.test("computeDailyCap — day 31+ returns min(dailySendCap, 200)", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  const cap = computeDailyCap({
    now: new Date(start.getTime() + 60 * DAY_MS),
    warmupStartedAt: start,
    warmupComplete: false,
    dailySendCap: 200,
  });
  if (cap !== 200) throw new Error(`expected 200, got ${cap}`);
});

Deno.test("computeDailyCap — day 31+ honors lower override cap", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  const cap = computeDailyCap({
    now: new Date(start.getTime() + 60 * DAY_MS),
    warmupStartedAt: start,
    warmupComplete: false,
    dailySendCap: 30,
  });
  if (cap !== 30) throw new Error(`expected 30, got ${cap}`);
});

import { canSendNow } from "./outreach-throttle.ts";

Deno.test("canSendNow — fresh mailbox under both caps returns allowed", () => {
  const r = canSendNow({
    now: new Date("2026-05-20T12:00:00Z"),
    sentToday: 0,
    sentThisHour: 0,
    effectiveDailyCap: 50,
    hourlySendCap: 20,
    lastSendAt: null,
  });
  if (r.allowed !== true) throw new Error(`expected allowed=true, got ${JSON.stringify(r)}`);
});

Deno.test("canSendNow — at hourly cap returns blocked + retry next hour boundary", () => {
  const now = new Date("2026-05-20T12:15:00Z");
  const r = canSendNow({
    now,
    sentToday: 18,
    sentThisHour: 20,
    effectiveDailyCap: 50,
    hourlySendCap: 20,
    lastSendAt: now,
  });
  if (r.allowed !== false) throw new Error("expected blocked");
  const expected = new Date("2026-05-20T13:00:00Z").getTime();
  if (r.retryAt?.getTime() !== expected) {
    throw new Error(`expected retry at 13:00Z, got ${r.retryAt?.toISOString()}`);
  }
});

Deno.test("canSendNow — at daily cap returns blocked + retry tomorrow 00:00 UTC", () => {
  const now = new Date("2026-05-20T18:00:00Z");
  const r = canSendNow({
    now,
    sentToday: 50,
    sentThisHour: 3,
    effectiveDailyCap: 50,
    hourlySendCap: 20,
    lastSendAt: now,
  });
  if (r.allowed !== false) throw new Error("expected blocked");
  const expected = new Date("2026-05-21T00:00:00Z").getTime();
  if (r.retryAt?.getTime() !== expected) {
    throw new Error(`expected retry at next-day 00:00Z, got ${r.retryAt?.toISOString()}`);
  }
});

Deno.test("canSendNow — effectiveDailyCap of 10 (during warmup) blocks at 10", () => {
  const now = new Date("2026-05-20T12:00:00Z");
  const r = canSendNow({
    now,
    sentToday: 10,
    sentThisHour: 0,
    effectiveDailyCap: 10,
    hourlySendCap: 20,
    lastSendAt: now,
  });
  if (r.allowed !== false) throw new Error("expected blocked at warmup day-1 cap");
});

Deno.test("canSendNow — daily cap takes precedence when both caps hit", () => {
  const now = new Date("2026-05-20T18:00:00Z");
  const r = canSendNow({
    now,
    sentToday: 50,
    sentThisHour: 20,
    effectiveDailyCap: 50,
    hourlySendCap: 20,
    lastSendAt: now,
  });
  if (r.allowed !== false) throw new Error("expected blocked");
  const tomorrow = new Date("2026-05-21T00:00:00Z").getTime();
  if (r.retryAt?.getTime() !== tomorrow) {
    throw new Error(`expected next-day retry when daily exhausted, got ${r.retryAt?.toISOString()}`);
  }
});
