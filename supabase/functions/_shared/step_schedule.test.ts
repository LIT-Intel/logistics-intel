// Tests for the Sub-project J.2 step-level scheduling helper.
//
// Run with: deno test supabase/functions/_shared/step_schedule.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyStepSchedule } from "./step_schedule.ts";

Deno.test("no-op when neither hint is set", () => {
  const base = "2026-06-12T18:57:00.000Z";
  const out = applyStepSchedule(base, {
    timeOfDayLocal: null,
    weekdaysOnly: false,
    timezone: "America/New_York",
  });
  assertEquals(out, base);
});

Deno.test("snap to 9 AM next morning when base is 6:57 PM EDT", () => {
  // 2026-06-12 18:57 UTC = 2026-06-12 14:57 EDT. 9 AM today is in the
  // past, so the snap bumps to 2026-06-13 09:00 EDT = 13:00 UTC.
  const out = applyStepSchedule("2026-06-12T18:57:00.000Z", {
    timeOfDayLocal: "09:00",
    weekdaysOnly: false,
    timezone: "America/New_York",
  });
  assertEquals(out, "2026-06-13T13:00:00.000Z");
});

Deno.test("snap to 9 AM same day when base is 4 AM EDT", () => {
  // 2026-06-12 08:00 UTC = 2026-06-12 04:00 EDT. 9 AM today is in the
  // future, so the snap lands at 2026-06-12 09:00 EDT = 13:00 UTC.
  const out = applyStepSchedule("2026-06-12T08:00:00.000Z", {
    timeOfDayLocal: "09:00",
    weekdaysOnly: false,
    timezone: "America/New_York",
  });
  assertEquals(out, "2026-06-12T13:00:00.000Z");
});

Deno.test("weekdays_only: Saturday-snapped result bumps to Monday", () => {
  // 2026-06-13 is a Saturday. Snapping to 9 AM EDT on Saturday + weekday
  // bump should land on Monday 2026-06-15 09:00 EDT = 13:00 UTC.
  const out = applyStepSchedule("2026-06-13T08:00:00.000Z", {
    timeOfDayLocal: "09:00",
    weekdaysOnly: true,
    timezone: "America/New_York",
  });
  assertEquals(out, "2026-06-15T13:00:00.000Z");
});

Deno.test("weekdays_only: Sunday bumps to Monday", () => {
  // 2026-06-14 is a Sunday.
  const out = applyStepSchedule("2026-06-14T08:00:00.000Z", {
    timeOfDayLocal: "09:00",
    weekdaysOnly: true,
    timezone: "America/New_York",
  });
  assertEquals(out, "2026-06-15T13:00:00.000Z");
});

Deno.test("weekdays_only without time-of-day preserves local clock", () => {
  // 2026-06-13 (Saturday) 18:00 UTC = 14:00 EDT. With weekdays_only and
  // no ToD, should bump to Monday 2026-06-15 14:00 EDT = 18:00 UTC.
  const out = applyStepSchedule("2026-06-13T18:00:00.000Z", {
    timeOfDayLocal: null,
    weekdaysOnly: true,
    timezone: "America/New_York",
  });
  assertEquals(out, "2026-06-15T18:00:00.000Z");
});

Deno.test("Friday after snap stays on Friday (no weekend bump)", () => {
  // 2026-06-12 is a Friday. Snap to 9 AM EDT next day would land on
  // Saturday only if base is post-9-AM. Base is 8 AM UTC = 4 AM EDT, so
  // snap lands at Friday 9 AM EDT = 13:00 UTC — Friday stays Friday.
  const out = applyStepSchedule("2026-06-12T08:00:00.000Z", {
    timeOfDayLocal: "09:00",
    weekdaysOnly: true,
    timezone: "America/New_York",
  });
  assertEquals(out, "2026-06-12T13:00:00.000Z");
});

Deno.test("UTC timezone passthrough", () => {
  // 2026-06-12 18:57 UTC, 9 AM UTC the next day.
  const out = applyStepSchedule("2026-06-12T18:57:00.000Z", {
    timeOfDayLocal: "09:00",
    weekdaysOnly: false,
    timezone: "UTC",
  });
  assertEquals(out, "2026-06-13T09:00:00.000Z");
});
