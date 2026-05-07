import React, { useEffect } from "react";
import { Link, useLocation, useParams, Navigate } from "react-router-dom";
import { ArrowRight, Calendar, Sparkles, CheckCircle2 } from "lucide-react";
import { SECTORS, type SectorId } from "./sectors";
import { SectorIllustration } from "./SectorIllustration";

// Sector landing pages: /l/<sector>
// Public, indexable, animated hero, primary "Start free trial" + secondary
// "Book a demo". Visit + CTA tracking pings track-landing-visit so we can
// attribute conversion by UTM and sector.

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || "";

function getOrCreateVisitId(): string {
  try {
    const k = "lit_visit_id";
    let v = localStorage.getItem(k);
    if (!v) {
      v = (crypto.randomUUID && crypto.randomUUID()) || `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return `t_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function pickUtm(search: string) {
  const sp = new URLSearchParams(search);
  return {
    utm_source: sp.get("utm_source"),
    utm_medium: sp.get("utm_medium"),
    utm_campaign: sp.get("utm_campaign"),
    utm_content: sp.get("utm_content"),
    utm_term: sp.get("utm_term"),
  };
}

async function ping(payload: Record<string, unknown>) {
  if (!SUPABASE_URL) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/track-landing-visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Non-blocking — visit tracking must never break the page.
  }
}

export default function SectorLandingPage() {
  const { sector: sectorParam } = useParams();
  const location = useLocation();
  const sector = sectorParam ? SECTORS[sectorParam as SectorId] : undefined;

  useEffect(() => {
    if (!sector) return;
    const utm = pickUtm(location.search);
    ping({
      sector: sector.id,
      visit_id: getOrCreateVisitId(),
      cta: "view",
      path: location.pathname + location.search,
      referrer: typeof document !== "undefined" ? document.referrer : null,
      ...utm,
    });
  }, [sector, location.pathname, location.search]);

  if (!sector) {
    return <Navigate to="/l/freight-forwarders" replace />;
  }

  function trackCta(cta: "start_trial" | "book_demo") {
    const utm = pickUtm(location.search);
    ping({
      sector: sector.id,
      visit_id: getOrCreateVisitId(),
      cta,
      path: location.pathname + location.search,
      referrer: typeof document !== "undefined" ? document.referrer : null,
      ...utm,
    });
  }

  return (
    <div className="min-h-screen bg-white text-[#0F172A]">
      {/* Top nav */}
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-white"
              style={{ background: sector.accent }}
              aria-hidden
            >
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-bold tracking-tight">Logistic Intel</span>
          </Link>
          <nav className="hidden items-center gap-5 text-[12.5px] font-semibold text-slate-600 md:flex">
            <Link to="/l/freight-forwarders" className="hover:text-[#0F172A]">Freight forwarders</Link>
            <Link to="/l/freight-brokers" className="hover:text-[#0F172A]">Brokers</Link>
            <Link to="/l/customs-brokers" className="hover:text-[#0F172A]">Customs brokers</Link>
            <Link to="/l/nvocc" className="hover:text-[#0F172A]">NVOCCs</Link>
            <Link to="/l/logistics-sales-teams" className="hover:text-[#0F172A]">Sales teams</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden text-[12.5px] font-semibold text-slate-700 hover:text-[#0F172A] sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              onClick={() => trackCta("start_trial")}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm"
              style={{ background: sector.accent }}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-slate-100">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 md:grid-cols-[1fr_minmax(320px,420px)]">
          <div>
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{ background: sector.accentSoft, color: sector.accent }}
            >
              <Sparkles className="h-3 w-3" />
              {sector.eyebrow}
            </div>
            <h1 className="mt-3 text-[28px] font-bold leading-[1.15] tracking-tight sm:text-[34px] md:text-[40px]">
              {sector.headline}
            </h1>
            <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-slate-600">
              {sector.subheadline}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                onClick={() => trackCta("start_trial")}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_6px_rgba(15,23,42,0.18)]"
                style={{ background: sector.accent }}
              >
                Start free trial
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/request-demo"
                onClick={() => trackCta("book_demo")}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Calendar className="h-3.5 w-3.5" />
                Book a demo
              </Link>
            </div>
            <div className="mt-3 text-[11.5px] text-slate-500">
              No credit card · Real shipment data on day one · Connect Gmail or Outlook in under a minute
            </div>
          </div>
          <div className="relative">
            <SectorIllustration sector={sector} />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-slate-100 bg-slate-50/60">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-6 sm:grid-cols-3 sm:px-6">
          {sector.metrics.map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[22px] font-bold leading-none" style={{ color: sector.accent }}>{m.value}</div>
              <div className="mt-1 text-[11.5px] text-slate-500">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
          <div className="grid gap-4 md:grid-cols-3">
            {sector.benefits.map((b, i) => (
              <article key={b.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div
                  className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-white"
                  style={{ background: sector.accent }}
                  aria-hidden
                >
                  <span className="text-[12px] font-bold">{i + 1}</span>
                </div>
                <h3 className="text-[15px] font-bold leading-snug tracking-tight">{b.title}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">{b.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA banner */}
      <section className="border-t border-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
          <div
            className="overflow-hidden rounded-3xl px-6 py-10 sm:px-10 md:px-14"
            style={{ background: `linear-gradient(135deg, ${sector.accent}, #0F172A)` }}
          >
            <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
              <div className="text-white">
                <h2 className="text-[24px] font-bold leading-tight tracking-tight md:text-[30px]">{sector.closing.title}</h2>
                <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-white/85">{sector.closing.body}</p>
                <ul className="mt-5 grid gap-2 text-[12.5px] text-white/90 sm:grid-cols-2">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> Live shipment data on day one</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> Verified contacts on saved accounts</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> Outbound from your own inbox</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> Real opens, clicks & replies</li>
                </ul>
              </div>
              <div className="flex flex-col gap-2 md:items-end">
                <Link
                  to="/signup"
                  onClick={() => trackCta("start_trial")}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#0F172A] shadow"
                >
                  Start free trial
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  to="/request-demo"
                  onClick={() => trackCta("book_demo")}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/30 px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-white/10"
                >
                  Book a demo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-[11.5px] text-slate-500 sm:px-6">
          <div>© {new Date().getFullYear()} Logistic Intel</div>
          <div className="flex gap-3">
            <Link to="/privacy" className="hover:text-slate-700">Privacy</Link>
            <Link to="/terms" className="hover:text-slate-700">Terms</Link>
            <a href="mailto:hello@logisticintel.com" className="hover:text-slate-700">hello@logisticintel.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
