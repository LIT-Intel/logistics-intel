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

export type CanSendNowInput = {
  now: Date;
  sentToday: number;
  sentThisHour: number;
  effectiveDailyCap: number;
  hourlySendCap: number;
  lastSendAt: Date | null;
};

export type CanSendNowResult =
  | { allowed: true; retryAt: null }
  | { allowed: false; retryAt: Date };

/**
 * Decides whether the mailbox can send one more email right now. If
 * blocked, returns the next time a send slot opens — caller pushes
 * `next_send_at` to that timestamp so the recipient is re-queued.
 *
 * Daily cap takes precedence: when sent_today >= effectiveDailyCap we
 * push to next-day 00:00 UTC even if hourly has room (we won't have
 * room when the new hour arrives either).
 */
export function canSendNow(input: CanSendNowInput): CanSendNowResult {
  const { now, sentToday, sentThisHour, effectiveDailyCap, hourlySendCap } = input;

  if (sentToday >= effectiveDailyCap) {
    const nextDay = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0,
    ));
    return { allowed: false, retryAt: nextDay };
  }

  if (sentThisHour >= hourlySendCap) {
    const nextHour = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours() + 1, 0, 0, 0,
    ));
    return { allowed: false, retryAt: nextHour };
  }

  return { allowed: true, retryAt: null };
}
