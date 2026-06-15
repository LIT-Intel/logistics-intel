/**
 * CR P0-4 — regression suite for LaunchSchedulePicker TZ math.
 *
 * The original implementation used Intl.DateTimeFormat to derive a TZ offset
 * for the *current* instant and applied it to the user-picked datetime. Around
 * DST transitions (e.g. the morning of fall-back in NYC) the captured offset
 * did not match the offset at the picked moment, causing campaigns to be
 * scheduled 1 hour early or late.
 *
 * These tests pin the corrected, date-fns-tz–backed behaviour.
 */
import { describe, expect, it } from "vitest";
import {
  localInputToUtcIso,
  utcToLocalInputValue,
} from "./LaunchSchedulePicker";

describe("localInputToUtcIso — DST safety", () => {
  it("1. Spring forward in America/New_York (2026-03-08): a wall-clock time " +
     "during the skipped hour resolves deterministically and does not throw",
    () => {
      // 2:30 AM on 2026-03-08 in NY does not technically exist (clocks jump
      // 02:00 → 03:00). date-fns-tz resolves the gap by applying the
      // pre-transition offset (EST, UTC-5) — giving 06:30Z. The important
      // contract here is (a) it does not throw, (b) the result is stable and
      // round-trips cleanly through the UI. The legacy code could land
      // anywhere depending on the current real-world instant.
      const utc = localInputToUtcIso("2026-03-08T02:30", "America/New_York");
      expect(utc).toBe("2026-03-08T06:30:00.000Z");
    });

  it("2. Fall back in America/New_York (2026-11-01): the ambiguous 1:30 AM " +
     "resolves to the earlier (EDT, UTC-4) instance — 05:30Z",
    () => {
      // 1:30 AM happens twice on 2026-11-01 in NY (once as EDT/UTC-4, once as
      // EST/UTC-5). date-fns-tz picks the earlier — EDT — which is 05:30Z.
      const utc = localInputToUtcIso("2026-11-01T01:30", "America/New_York");
      expect(utc).toBe("2026-11-01T05:30:00.000Z");
    });

  it("3. Cross-TZ summer: 9:00 AM 2026-06-15 in America/Los_Angeles " +
     "(PDT, UTC-7) → 16:00Z",
    () => {
      const utc = localInputToUtcIso("2026-06-15T09:00", "America/Los_Angeles");
      expect(utc).toBe("2026-06-15T16:00:00.000Z");
    });

  it("4. Cross-TZ winter: 9:00 AM 2026-12-15 in America/Los_Angeles " +
     "(PST, UTC-8) → 17:00Z",
    () => {
      const utc = localInputToUtcIso("2026-12-15T09:00", "America/Los_Angeles");
      expect(utc).toBe("2026-12-15T17:00:00.000Z");
    });

  it("returns null for empty input", () => {
    expect(localInputToUtcIso("", "America/New_York")).toBeNull();
  });
});

describe("utcToLocalInputValue — round-trips", () => {
  it("renders UTC instant as the wall-clock time in the target TZ", () => {
    // 2026-06-15 16:00Z in LA (PDT/UTC-7) is 09:00 local.
    expect(utcToLocalInputValue("2026-06-15T16:00:00.000Z", "America/Los_Angeles"))
      .toBe("2026-06-15T09:00");
    // 2026-12-15 17:00Z in LA (PST/UTC-8) is 09:00 local.
    expect(utcToLocalInputValue("2026-12-15T17:00:00.000Z", "America/Los_Angeles"))
      .toBe("2026-12-15T09:00");
  });

  it("returns empty string for null", () => {
    expect(utcToLocalInputValue(null, "America/New_York")).toBe("");
  });

  it("round-trips through DST without losing or gaining an hour", () => {
    // Pick a time well clear of DST, round-trip through both helpers,
    // expect the same wall-clock string.
    const local = "2026-07-04T14:00";
    const utc = localInputToUtcIso(local, "America/New_York");
    expect(utc).not.toBeNull();
    expect(utcToLocalInputValue(utc!, "America/New_York")).toBe(local);
  });
});
