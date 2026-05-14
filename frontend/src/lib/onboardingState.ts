// Per-user, per-page onboarding state client. Reads + writes
// lit_user_onboarding_state via the standard supabase client; RLS
// limits to the calling user's rows.
//
// Usage:
//   const map = await loadOnboardingState();   // { page_key: { completed, dismissed } }
//   await markTutorialDismissed("dashboard"); // user closed the card
//   await markTutorialCompleted("dashboard"); // user clicked "Got it"
//   await resetOnboarding();                  // user reset from Settings

import { supabase } from "@/lib/supabase";

export type OnboardingRow = {
  page_key: string;
  completed: boolean;
  completed_at: string | null;
  dismissed: boolean;
  dismissed_at: string | null;
};

export type OnboardingMap = Record<string, OnboardingRow>;

const EMPTY: OnboardingMap = {};

/** Load every onboarding row for the current user. Caller decides
 *  which page_keys are interesting. Returns an empty map when the
 *  user isn't authenticated or the table is empty. */
export async function loadOnboardingState(): Promise<OnboardingMap> {
  try {
    const { data, error } = await supabase
      .from("lit_user_onboarding_state")
      .select("page_key, completed, completed_at, dismissed, dismissed_at")
      .limit(200);
    if (error) {
      console.warn("[onboarding] loadOnboardingState failed:", error.message);
      return EMPTY;
    }
    const out: OnboardingMap = {};
    for (const row of (data ?? []) as OnboardingRow[]) out[row.page_key] = row;
    return out;
  } catch (err) {
    console.warn("[onboarding] loadOnboardingState threw:", err);
    return EMPTY;
  }
}

/** Should the tutorial card render for this page? Hidden once the
 *  user has either completed or dismissed it. */
export function shouldShowTutorial(map: OnboardingMap, pageKey: string): boolean {
  const row = map[pageKey];
  if (!row) return true;
  return !row.completed && !row.dismissed;
}

async function upsertOnboardingRow(pageKey: string, patch: Partial<OnboardingRow>): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return false;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("lit_user_onboarding_state")
      .upsert(
        {
          user_id: userId,
          page_key: pageKey,
          completed: patch.completed ?? false,
          completed_at: patch.completed ? now : patch.completed_at ?? null,
          dismissed: patch.dismissed ?? false,
          dismissed_at: patch.dismissed ? now : patch.dismissed_at ?? null,
          updated_at: now,
        },
        { onConflict: "user_id,page_key" },
      );
    if (error) {
      console.warn("[onboarding] upsert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[onboarding] upsert threw:", err);
    return false;
  }
}

export function markTutorialCompleted(pageKey: string) {
  return upsertOnboardingRow(pageKey, { completed: true });
}

export function markTutorialDismissed(pageKey: string) {
  return upsertOnboardingRow(pageKey, { dismissed: true });
}

/** Wipe every onboarding row for the current user so the tour
 *  surfaces fresh on every page. Used by Settings → Reset onboarding. */
export async function resetOnboarding(): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return false;
    const { error } = await supabase
      .from("lit_user_onboarding_state")
      .delete()
      .eq("user_id", userId);
    if (error) {
      console.warn("[onboarding] reset failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[onboarding] reset threw:", err);
    return false;
  }
}
