import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  User,
  Building2,
  Phone,
  Mail,
  Check,
  Calendar,
  ArrowLeft,
  ArrowRight,
  Search,
  Megaphone,
  Users,
  BarChart3,
  Route as RouteIcon,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import {
  COMPANY_TYPES,
  INTEREST_OPTIONS,
  DEMO_BOOKING_URL,
  completeOnboarding,
  type CompanyType,
} from "@/api/onboarding";

// Icons for the multi-select interest chips (order matches INTEREST_OPTIONS).
const INTEREST_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  finding_shippers: Search,
  outreach: Megaphone,
  crm: Users,
  market_intel: BarChart3,
  competitor_lanes: RouteIcon,
  other: Sparkles,
};

const TOTAL_STEPS = 3;

function StepDots({ step }: { step: number }) {
  return (
    <div className="mb-8 flex items-center gap-2">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <React.Fragment key={n}>
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                done
                  ? "bg-emerald-500 text-white"
                  : active
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            {n < TOTAL_STEPS && (
              <div className={`h-px flex-1 ${n < step ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Left branded panel — mirrors ModernSignupPage.BrandPanel ────────────────
function BrandPanel({ step }: { step: number }) {
  const copy = [
    {
      badge: "Step 1 of 3 — Your details",
      title: "Welcome aboard. Let's set up your workspace.",
      body: "A few quick details so we can tailor Logistics Intel to how you sell freight.",
    },
    {
      badge: "Step 2 of 3 — About your business",
      title: "Tell us what you do.",
      body: "This shapes the shippers, lanes, and outreach tools we surface for you first.",
    },
    {
      badge: "Step 3 of 3 — See it live",
      title: "Get the most from your trial.",
      body: "Book a 30-minute walkthrough with our team — or jump straight in and explore.",
    },
  ][step - 1];

  return (
    <div className="hidden flex-col justify-between rounded-l-[28px] bg-slate-900 px-10 py-10 text-white lg:flex">
      <img
        src="/lit-logo-horizontal.svg"
        alt="Logistics Intel"
        className="h-8 w-auto"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div className="my-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-400 ring-1 ring-cyan-400/20">
          {copy.badge}
        </div>
        <h2 className="text-3xl font-bold leading-tight text-white">{copy.title}</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-slate-400">{copy.body}</p>
      </div>
      <div className="grid grid-cols-2 gap-6 border-t border-slate-700/60 pt-6">
        <div>
          <div className="text-2xl font-bold text-white">3.2M+</div>
          <div className="mt-0.5 text-xs uppercase tracking-widest text-slate-500">Companies tracked</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">Live</div>
          <div className="mt-0.5 text-xs uppercase tracking-widest text-slate-500">Shipment intel sync</div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, fullName: authName } = useAuth();

  // Where to land once onboarding is done. Preserve any ?next= a guard passed.
  const nextParam = (searchParams.get("next") || "").trim();
  const destination = nextParam && nextParam.startsWith("/app") ? nextParam : "/app/search";

  const authEmail = user?.email ?? "";
  const metaCompany =
    (user?.user_metadata?.company as string | undefined) ||
    (user?.user_metadata?.company_name as string | undefined) ||
    "";

  const [step, setStep] = useState(1);
  const [fullNameVal, setFullNameVal] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [companyType, setCompanyType] = useState<CompanyType | "">("");
  const [interests, setInterests] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Prefill name/company from the auth metadata captured at signup.
  useEffect(() => {
    if (authName && !fullNameVal) setFullNameVal(authName);
  }, [authName]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (metaCompany && !company) setCompany(metaCompany);
  }, [metaCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  const step1Valid = useMemo(
    () => fullNameVal.trim().length >= 2 && company.trim().length >= 2 && phone.trim().length >= 5,
    [fullNameVal, company, phone],
  );
  const step2Valid = useMemo(
    () => Boolean(companyType) && interests.length >= 1,
    [companyType, interests],
  );

  function goNext() {
    setErr("");
    if (step === 1 && !step1Valid) {
      setErr("Please enter your name, company, and a phone number.");
      return;
    }
    if (step === 2 && !step2Valid) {
      setErr("Pick your company type and at least one interest.");
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function goBack() {
    setErr("");
    setStep((s) => Math.max(1, s - 1));
  }

  // Persist + unlock. Called from step 3 (both "book a demo" and "skip").
  async function finish(demoBooked: boolean) {
    if (!step1Valid || !step2Valid) {
      setErr("Please complete the earlier steps.");
      setStep(!step1Valid ? 1 : 2);
      return;
    }
    setErr("");
    setSaving(true);
    try {
      const res = await completeOnboarding({
        fullName: fullNameVal.trim(),
        companyName: company.trim(),
        phone: phone.trim(),
        companyType: companyType as CompanyType,
        interests,
        demoBooked,
      });
      if (!res.ok) {
        setErr(mapReason(res.reason));
        setSaving(false);
        return;
      }
      // Hard reload into the app so AuthProvider re-reads the (now set) flag
      // and the guard lets the user through cleanly.
      window.location.assign(destination);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  function handleBookDemo() {
    // Open the cal.com booking in a new tab, mark demo_booked, and unlock.
    window.open(DEMO_BOOKING_URL, "_blank", "noopener,noreferrer");
    void finish(true);
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] shadow-2xl shadow-slate-900/20 lg:grid lg:grid-cols-[5fr_6fr]">
        <BrandPanel step={step} />

        <div className="bg-white px-8 py-10 sm:px-12">
          <StepDots step={step} />

          {err && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          )}

          {/* ── STEP 1 — Your details ── */}
          {step === 1 && (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Your details</h1>
              <p className="mt-1 mb-7 text-sm text-slate-500">
                Confirm who you are so we can personalize your workspace.
              </p>
              <div className="space-y-4">
                <Field label="Full name">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Jane Smith"
                    value={fullNameVal}
                    onChange={(e) => setFullNameVal(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Company name">
                  <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Acme Logistics"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Phone number">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    required
                    placeholder="+1 (555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Work email">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    disabled
                    value={authEmail}
                    className={`${inputCls} disabled:opacity-75`}
                  />
                </Field>
              </div>
            </>
          )}

          {/* ── STEP 2 — Qualification ── */}
          {step === 2 && (
            <>
              <h1 className="text-2xl font-bold text-slate-900">About your business</h1>
              <p className="mt-1 mb-7 text-sm text-slate-500">
                Helps us surface the right shippers and tools for you.
              </p>

              <p className="mb-2 text-sm font-medium text-slate-700">
                What best describes your company?
              </p>
              <div className="mb-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {COMPANY_TYPES.map((t) => {
                  const active = companyType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCompanyType(t)}
                      className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                        active
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              <p className="mb-2 text-sm font-medium text-slate-700">
                What are you most interested in?{" "}
                <span className="font-normal text-slate-400">(choose any)</span>
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {INTEREST_OPTIONS.map(({ value, label }) => {
                  const active = interests.includes(value);
                  const Icon = INTEREST_ICONS[value] || Sparkles;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleInterest(value)}
                      className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition ${
                        active
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                      {label}
                      {active && <Check className="ml-auto h-4 w-4 text-indigo-600" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ── STEP 3 — Book a demo (skippable) ── */}
          {step === 3 && (
            <>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                  <Calendar className="h-8 w-8" />
                </div>
                <h1 className="mt-5 text-2xl font-bold text-slate-900">
                  Book your 30-minute demo
                </h1>
                <p className="mt-3 max-w-sm text-sm text-slate-500">
                  Get a personalized walkthrough — we'll show you how to find your
                  best-fit shippers and launch outreach in minutes. Strongly
                  recommended, but you can always do it later.
                </p>

                <button
                  type="button"
                  onClick={handleBookDemo}
                  disabled={saving}
                  className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Calendar className="h-4 w-4" />
                  {saving ? "Finishing up…" : "Book my demo & continue"}
                </button>

                <button
                  type="button"
                  onClick={() => finish(false)}
                  disabled={saving}
                  className="mt-4 text-sm font-medium text-slate-400 underline-offset-2 transition hover:text-slate-600 hover:underline disabled:opacity-60"
                >
                  Skip for now — take me to the app
                </button>
              </div>
            </>
          )}

          {/* ── Nav (steps 1 & 2) ── */}
          {step < 3 && (
            <div className="mt-8 flex items-center justify-between">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">{children}</div>
    </div>
  );
}

function mapReason(reason: string): string {
  switch (reason) {
    case "phone_required":
      return "Please enter a phone number.";
    case "full_name_required":
      return "Please enter your full name.";
    case "company_type_invalid":
      return "Please select what best describes your company.";
    case "interests_required":
      return "Please pick at least one interest.";
    case "unauthenticated":
      return "Your session expired — please sign in again.";
    default:
      return "We couldn't save your details. Please try again.";
  }
}
