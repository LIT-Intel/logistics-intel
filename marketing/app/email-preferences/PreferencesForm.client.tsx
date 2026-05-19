"use client";

/**
 * Interactive island for the preference center. Lives next to the
 * server page so the initial values come from Supabase (no flash of
 * unchecked boxes) and only the interactive bits cost a JS payload.
 */

import { useState } from "react";

type Prefs = {
  email: string;
  trial_welcome: boolean;
  top_100_followup: boolean;
  partner_onboarding: boolean;
  comparison_nurture: boolean;
  unsubscribed_all: boolean;
};

const SEQUENCE_OPTIONS: Array<{
  key: keyof Omit<Prefs, "email" | "unsubscribed_all">;
  label: string;
  description: string;
}> = [
  {
    key: "trial_welcome",
    label: "Free trial nurture",
    description: "5 emails over 14 days — onboarding and trial walkthroughs.",
  },
  {
    key: "top_100_followup",
    label: "Top-100 PDF follow-up",
    description: "3 emails over 7 days — getting the most from the shipper list.",
  },
  {
    key: "partner_onboarding",
    label: "Partner program updates",
    description: "3 emails — partner activation, playbook, and coaching.",
  },
  {
    key: "comparison_nurture",
    label: "Competitor / alternative comparisons",
    description: "2 emails — how LIT compares to your current stack.",
  },
];

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export default function PreferencesForm({
  token,
  initial,
}: {
  token: string;
  initial: Prefs;
}) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  function toggle(key: keyof Omit<Prefs, "email" | "unsubscribed_all">) {
    setPrefs((p) => ({
      ...p,
      [key]: !p[key],
      // Re-engaging any sequence clears the master kill switch — saves
      // an extra round-trip for the common "I unsubscribed by accident"
      // path.
      unsubscribed_all: false,
    }));
    setSave({ status: "idle" });
  }

  async function persist(next: Prefs) {
    setSave({ status: "saving" });
    try {
      const res = await fetch(
        `/api/email-preferences?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            trial_welcome: next.trial_welcome,
            top_100_followup: next.top_100_followup,
            partner_onboarding: next.partner_onboarding,
            comparison_nurture: next.comparison_nurture,
            unsubscribed_all: next.unsubscribed_all,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        preferences?: Prefs;
      };
      if (!res.ok || !json.ok) {
        setSave({
          status: "error",
          message:
            json.error === "invalid_token"
              ? "This preferences link is no longer valid. Reopen the latest email and try again."
              : "Couldn't save right now. Try again in a moment.",
        });
        return;
      }
      if (json.preferences) setPrefs(json.preferences);
      setSave({ status: "saved" });
    } catch {
      setSave({
        status: "error",
        message: "Network error. Check your connection and try again.",
      });
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await persist(prefs);
  }

  async function handleUnsubscribeAll() {
    const next: Prefs = {
      ...prefs,
      trial_welcome: false,
      top_100_followup: false,
      partner_onboarding: false,
      comparison_nurture: false,
      unsubscribed_all: true,
    };
    setPrefs(next);
    await persist(next);
  }

  const allOff = prefs.unsubscribed_all;

  return (
    <form onSubmit={handleSave} className="mt-6 space-y-5">
      <fieldset
        className="space-y-3"
        disabled={save.status === "saving"}
        aria-describedby={allOff ? "unsub-all-note" : undefined}
      >
        <legend className="text-sm font-semibold text-slate-900">
          Marketing sequences
        </legend>
        {SEQUENCE_OPTIONS.map((opt) => (
          <label
            key={opt.key}
            className={[
              "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition",
              prefs[opt.key] && !allOff
                ? "border-[#1d4ed8]/40 bg-[#1d4ed8]/5"
                : "border-slate-200 bg-white hover:border-slate-300",
            ].join(" ")}
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 text-[#1d4ed8] focus:ring-[#00F0FF]"
              checked={prefs[opt.key] && !allOff}
              onChange={() => toggle(opt.key)}
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-slate-900">
                {opt.label}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {opt.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handleUnsubscribeAll}
          disabled={save.status === "saving"}
          className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Unsubscribe from all marketing emails
        </button>
        <button
          type="submit"
          disabled={save.status === "saving"}
          className="inline-flex items-center justify-center rounded-lg bg-[#00F0FF] px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-[#00F0FF]/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {save.status === "saving" ? "Saving…" : "Save preferences"}
        </button>
      </div>

      {allOff && (
        <p id="unsub-all-note" className="text-xs text-slate-500">
          You're unsubscribed from all marketing emails. Re-check any box above
          and save to opt back in to that sequence only.
        </p>
      )}
      {save.status === "saved" && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
        >
          Preferences saved.
        </p>
      )}
      {save.status === "error" && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {save.message}
        </p>
      )}
    </form>
  );
}
