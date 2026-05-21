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
