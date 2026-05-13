"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";

type State = "idle" | "submitting" | "ok" | "error";

/**
 * Partner / affiliate application form — POSTs to /api/partner-application
 * which writes to Sanity (visible in Studio under "Inbox → Partner
 * applications") and fans out to email + Slack. Honeypot + client-side
 * validation. On success, swaps to a friendly confirmation panel.
 */
export function PartnerApplicationForm() {
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "submitting") return;
    setState("submitting");
    setErrorMessage(null);

    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());

    // Capture referrer + UTM if present
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const utm =
        params.get("utm_source") || params.get("utm_campaign") || document.referrer || window.location.pathname;
      if (utm) (payload as any).source = utm;
    }

    try {
      const r = await fetch("/api/partner-application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        setState("ok");
      } else {
        setState("error");
        setErrorMessage(
          j.error === "invalid_email"
            ? "Please enter a valid email."
            : j.error?.startsWith?.("missing_field:")
            ? "Please fill in the required fields."
            : "Submission failed. Please try again or email partnerships@logisticintel.com.",
        );
      }
    } catch {
      setState("error");
      setErrorMessage("Network error. Please try again.");
    }
  }

  if (state === "ok") {
    return (
      <div
        className="rounded-3xl border border-emerald-200 bg-white p-10 text-center shadow-sm"
        role="status"
      >
        <div
          className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            background: "rgba(16,185,129,0.12)",
            boxShadow: "inset 0 0 0 1px rgba(16,185,129,0.3)",
          }}
        >
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        </div>
        <h3 className="font-display mt-5 text-[22px] font-semibold tracking-[-0.015em] text-ink-900">
          Application received.
        </h3>
        <p className="font-body mx-auto mt-3 max-w-[440px] text-[14px] leading-relaxed text-ink-500">
          Our partnerships team reviews every application within two business days. You&apos;ll hear
          back at the email you provided with next steps and your partner materials.
        </p>
        <p className="font-body mx-auto mt-3 max-w-[440px] text-[12.5px] text-ink-500">
          Questions in the meantime?{" "}
          <a
            href="mailto:partnerships@logisticintel.com"
            className="font-medium text-brand-blue underline"
          >
            partnerships@logisticintel.com
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <input
        type="text"
        name="_hp"
        tabIndex={-1}
        autoComplete="off"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
        aria-hidden
      />

      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Full name *" name="name" required autoComplete="name" />
        <Field label="Email *" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Field
          label="Company or brand"
          name="companyOrBrand"
          autoComplete="organization"
          placeholder="Freight Caviar, Acme Newsletter, etc."
        />
        <Field
          label="Website or social link"
          name="websiteOrSocial"
          autoComplete="url"
          placeholder="freightcaviar.com or @handle"
        />
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Select
          label="Audience type"
          name="audienceType"
          options={[
            { value: "", label: "Select…" },
            { value: "creator", label: "Freight creator (YouTube / TikTok / Reels)" },
            { value: "newsletter", label: "Logistics newsletter" },
            { value: "podcast", label: "Podcast host" },
            { value: "consultant", label: "Consultant" },
            { value: "coach", label: "Freight sales coach" },
            { value: "agency", label: "Marketing agency (logistics)" },
            { value: "saas", label: "SaaS / referral partner" },
            { value: "other", label: "Other" },
          ]}
        />
        <Select
          label="Estimated audience size"
          name="estimatedAudienceSize"
          options={[
            { value: "", label: "Select…" },
            { value: "<1k", label: "Under 1,000" },
            { value: "1k-10k", label: "1,000 – 10,000" },
            { value: "10k-50k", label: "10,000 – 50,000" },
            { value: "50k-250k", label: "50,000 – 250,000" },
            { value: "250k+", label: "250,000+" },
          ]}
        />
      </div>

      <Textarea
        label="How do you plan to promote LIT?"
        name="promotionPlan"
        rows={3}
        placeholder="e.g. Monthly newsletter feature, dedicated YouTube review, podcast sponsorship, agency rollout to existing freight clients…"
      />

      <Field
        label="Payout email (optional)"
        name="payoutEmail"
        type="email"
        placeholder="Stripe or PayPal email for commission payouts"
        autoComplete="email"
      />

      <Textarea
        label="Anything else we should know? (Optional)"
        name="notes"
        rows={2}
      />

      {state === "error" && errorMessage && (
        <div
          className="font-body flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="font-display inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
      >
        {state === "submitting" ? "Submitting…" : "Apply to the partner program"}
        {state !== "submitting" && <ArrowRight className="h-4 w-4" />}
      </button>

      <p className="font-body mt-2 text-center text-[11.5px] text-ink-200">
        Applications reviewed within 2 business days. No automatic approval.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="font-display mb-1 block text-[11.5px] font-semibold text-ink-700">{label}</span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="font-body block h-11 w-full rounded-lg border border-ink-100 bg-white px-3 text-[14px] text-ink-900 placeholder:text-ink-200 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
      />
    </label>
  );
}

function Select({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="font-display mb-1 block text-[11.5px] font-semibold text-ink-700">{label}</span>
      <select
        name={name}
        className="font-body block h-11 w-full rounded-lg border border-ink-100 bg-white px-3 text-[14px] text-ink-900 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Textarea({
  label,
  name,
  rows = 3,
  placeholder,
}: {
  label: string;
  name: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-display mb-1 block text-[11.5px] font-semibold text-ink-700">{label}</span>
      <textarea
        name={name}
        rows={rows}
        placeholder={placeholder}
        className="font-body block w-full resize-none rounded-lg border border-ink-100 bg-white px-3 py-2.5 text-[14px] text-ink-900 placeholder:text-ink-200 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
      />
    </label>
  );
}
