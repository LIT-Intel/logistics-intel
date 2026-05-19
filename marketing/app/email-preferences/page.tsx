/**
 * Public email preference center.
 *
 * Reached via the {{{preferences_url}}} token in every marketing email.
 * Token-gated — no session required. Stripped layout (no marketing nav)
 * because this is a transactional utility page, not a money page.
 *
 * Architecture:
 *   - This file is a server component. It verifies the token server-side
 *     and renders the page only if the token is valid (no fallback to
 *     "please log in" — broken links should fail loud so we notice).
 *   - The initial preferences row is fetched server-side from Supabase
 *     to avoid a flash of unchecked boxes. The interactive form is a
 *     client island that posts to /api/email-preferences.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { verifyPreferencesToken } from "@/lib/preferences-token";
import { createClient } from "@supabase/supabase-js";
import PreferencesForm from "./PreferencesForm.client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email preferences · LIT",
  description: "Manage which marketing emails you receive from Logistic Intel.",
  robots: { index: false, follow: false },
};

type Prefs = {
  email: string;
  trial_welcome: boolean;
  top_100_followup: boolean;
  partner_onboarding: boolean;
  comparison_nurture: boolean;
  unsubscribed_all: boolean;
};

function defaultPrefs(email: string): Prefs {
  return {
    email,
    trial_welcome: true,
    top_100_followup: true,
    partner_onboarding: true,
    comparison_nurture: true,
    unsubscribed_all: false,
  };
}

async function loadPrefs(email: string): Promise<Prefs> {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return defaultPrefs(email);
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase
    .from("lit_email_preferences")
    .select(
      "email, trial_welcome, top_100_followup, partner_onboarding, comparison_nurture, unsubscribed_all",
    )
    .eq("email", email)
    .maybeSingle();
  return (data as Prefs | null) ?? defaultPrefs(email);
}

export default async function EmailPreferencesPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams?.token ?? "";
  const email = verifyPreferencesToken(token);

  if (!email) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <Header />
        <section className="mx-auto max-w-xl px-6 py-16">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              This preferences link is no longer valid
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              The link in your email may have expired (links are valid for 90
              days) or been mistyped. Open the latest Logistic Intel email and
              click "manage preferences" again, or email{" "}
              <a
                className="text-[#1d4ed8] underline underline-offset-2"
                href="mailto:support@logisticintel.com"
              >
                support@logisticintel.com
              </a>
              .
            </p>
          </div>
        </section>
      </main>
    );
  }

  const prefs = await loadPrefs(email);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <Header />
      <section className="mx-auto max-w-xl px-6 py-12 sm:py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Email preferences
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Choose which marketing emails you want to receive. Transactional
            notifications (account, billing, security) aren't affected.
          </p>
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-500">Email</span>
            <div className="mt-0.5 font-medium text-slate-900">{email}</div>
          </div>
          <PreferencesForm token={token} initial={prefs} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Need help?{" "}
          <a
            className="text-[#1d4ed8] underline underline-offset-2"
            href="mailto:support@logisticintel.com"
          >
            support@logisticintel.com
          </a>
        </p>
      </section>
    </main>
  );
}

function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-slate-900">
          {/* Use the master icon so this works even if marketing nav is
              swapped out — preference center should never break. */}
          <img
            src="/lit-icon-master.svg"
            alt="Logistic Intel"
            width={28}
            height={28}
            className="h-7 w-7"
          />
          <span className="text-sm font-semibold tracking-tight">
            Logistic Intel
          </span>
        </Link>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Preferences
        </span>
      </div>
    </header>
  );
}
