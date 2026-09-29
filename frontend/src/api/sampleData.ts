/**
 * Onboarding sample data — thin client over the `seed-sample-data` edge fn.
 *
 * The function (POST, JWT) seeds 5 well-known saved companies + deals across
 * pipeline stages + one DRAFT campaign + tasks, all tagged `is_sample=true`
 * and idempotent per org (organizations.sample_seeded_at). `{action:"clear"}`
 * permanently deletes every is_sample row for the org and never re-seeds.
 *
 * These give a brand-new workspace an instantly-populated Command Center so
 * the surfaces explain themselves; a dismissible banner offers "Clear
 * examples" once the user has their own data.
 */
import { supabase } from "@/lib/supabase";

/** Parse the edge fn's `{ ok:false, error }` envelope out of a Functions error. */
async function readInvokeError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.clone === "function") {
    try {
      const parsed = await ctx.clone().json();
      if (parsed?.error) return String(parsed.error);
    } catch {
      /* fall through */
    }
  }
  return (error as any)?.message || fallback;
}

/**
 * Seed the org's sample data. Idempotent server-side per org — a second call
 * resolves with `seeded:false`. Returns the row counts when a fresh seed ran.
 */
export async function seedSampleData(): Promise<{ seeded: boolean; counts?: any }> {
  const { data, error } = await supabase.functions.invoke("seed-sample-data", {
    body: {},
  });
  if (error) throw new Error(await readInvokeError(error, "Failed to seed sample data"));
  if (data && data.ok === false) throw new Error(String(data.error || "Failed to seed sample data"));
  return { seeded: !!data?.seeded, counts: data?.counts };
}

/**
 * Permanently delete every is_sample row for the org. This never re-seeds
 * (the server clears organizations.sample_seeded_at guard so the auto-trigger
 * won't bring the examples back).
 */
export async function clearSampleData(): Promise<void> {
  const { data, error } = await supabase.functions.invoke("seed-sample-data", {
    body: { action: "clear" },
  });
  if (error) throw new Error(await readInvokeError(error, "Failed to clear sample data"));
  if (data && data.ok === false) throw new Error(String(data.error || "Failed to clear sample data"));
}
