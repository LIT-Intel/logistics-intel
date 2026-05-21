// supabase/functions/_shared/outreach-throttle.ts
// Pure helpers for the campaign dispatcher. No I/O — all decisions take
// the account row state as input so they're trivially unit-testable.

const DAY_MS = 86_400_000;

export type ComputeDailyCapInput = {
  now: Date;
  warmupStartedAt: Date | null;
  warmupComplete: boolean;
  dailySendCap: number;
};

/**
 * Returns the effective daily send cap for a mailbox right now. Accounts
 * for the 30-day warmup ramp; falls back to the configured cap once the
 * ramp completes or when warmup_complete is manually set true.
 */
export function computeDailyCap(input: ComputeDailyCapInput): number {
  const { now, warmupStartedAt, warmupComplete, dailySendCap } = input;

  if (warmupComplete || warmupStartedAt === null) {
    return dailySendCap;
  }

  const daysSinceStart = Math.floor((now.getTime() - warmupStartedAt.getTime()) / DAY_MS);

  let rampCap: number;
  if (daysSinceStart < 3)       rampCap = 10;
  else if (daysSinceStart < 7)  rampCap = 25;
  else if (daysSinceStart < 14) rampCap = 50;
  else if (daysSinceStart < 21) rampCap = 100;
  else if (daysSinceStart < 30) rampCap = 150;
  else                          rampCap = 200;

  return Math.min(rampCap, dailySendCap);
}
