"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";

type State = "idle" | "submitting" | "ok" | "error";

/**
 * Live demo request form — POSTs to /api/demo-request which writes to
 * Sanity (visible in Studio under "Inbox → Demo requests"). Includes
 * honeypot + client-side validation. On success, swaps to a friendly
 * confirmation panel with next-steps.
 */
export function DemoRequestForm() {
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("submitting");
    setErrorMessage(null);

    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());

    // Capture referrer + UTM if present
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const utm =
        params.get("utm_source") || params.get("utm_campaign") || document.referrer || "";
      if (utm) (payload as any).source = utm;
    }

    try {
      const r = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        setState("ok");
      } else {
        setState("error");
        setErrorMessage(j.error || "Submission failed. Please try again.");
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
          Got it. We'll reach out shortly.
        </h3>
        <p className="font-body mx-auto mt-3 max-w-[440px] text-[14px] leading-relaxed text-ink-500">
          Someone from the team will email you within one business day to confirm a time. Meanwhile,
          you can start exploring with a free trial — no card required.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href={(process.env.NEXT_PUBLIC_APP_URL || "https://app.logisticintel.com") + "/signup"}
            className="font-display inline-flex h-11 items-center gap-2 rounded-md px-5 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]"
            style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
          >
            Start free trial <ArrowRight className="h-3.5 w-3.5" />
          </a>
          <a
            href="/products"
            className="font-display inline-flex h-11 items-center gap-2 rounded-md border border-ink-100 bg-white px-5 text-[13px] font-semibold text-ink-900 hover:bg-ink-25"
          >
            Explore the platform
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      {/* Honeypot — bots will fill this; humans never see it */}
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
        <Field label="Work email *" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Company" name="company" autoComplete="organization" />
        <Field label="Company domain" name="domain" placeholder="acme.com" />
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Select
          label="What best describes your team?"
          name="useCase"
          options={[
            { value: "", label: "Select…" },
            { value: "freight-forwarder", label: "Freight forwarder" },
            { value: "freight-broker", label: "Freight broker" },
            { value: "3pl", label: "3PL / project logistics" },
            { value: "importer", label: "Importer / exporter" },
            { value: "other", label: "Other" },
          ]}
        />
        <Select
          label="Team size"
          name="teamSize"
          options={[
            { value: "", label: "Select…" },
            { value: "1", label: "Just me" },
            { value: "2-10", label: "2–10" },
            { value: "11-50", label: "11–50" },
            { value: "51-200", label: "51–200" },
            { value: "200+", label: "200+" },
          ]}
        />
      </div>

      <Field label="Phone (optional)" name="phone" type="tel" autoComplete="tel" />

      <Textarea
        label="What are you hoping LIT will help with? (Optional)"
        name="primaryGoal"
        rows={3}
        placeholder="e.g. Find more active VN→US importers, replace ImportYeti, build outbound around lane signals…"
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
        {state === "submitting" ? "Submitting…" : "Request demo"}
        {state !== "submitting" && <ArrowRight className="h-4 w-4" />}
      </button>

      <p className="font-body mt-2 text-center text-[11.5px] text-ink-200">
        We respond within one business day. No spam, no auto-cadences.
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
