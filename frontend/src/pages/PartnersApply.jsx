// /partners/apply — public conversion landing for the LIT Partner Program.
// Wraps the existing post-login AffiliateApplication form with a real
// value-prop surface so a cold visitor understands WHY they should apply
// before they see the form.
//
// The CTA routes to:
//   - /app/affiliate           if the visitor is already signed in
//   - /signup?next=/app/affiliate  if logged out (signup → onboarding → form)
//
// /app/affiliate already shows the application form for users who don't
// yet have a partner record, so this page is purely additive — no form
// logic is duplicated.

import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Coins,
  FileText,
  Megaphone,
  TrendingUp,
  Users,
  ShieldCheck,
  Mail,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { T, Btn } from "@/components/affiliate/tokens";
import { Badge, Card } from "@/components/affiliate/primitives";

// ── Section primitives ──────────────────────────────────────────────────
function Section({ children, style }) {
  return (
    <section
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "0 28px",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function ValueCard({ icon: Icon, title, body }) {
  return (
    <Card style={{ padding: 22 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: T.brandSoft,
          color: T.brand,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <Icon size={17} />
      </div>
      <div
        style={{
          fontFamily: T.ffDisplay,
          fontSize: 15,
          fontWeight: 700,
          color: T.ink,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: T.inkMuted,
        }}
      >
        {body}
      </div>
    </Card>
  );
}

function StepCard({ n, title, body }) {
  return (
    <Card style={{ padding: 22, position: "relative" }}>
      <div
        style={{
          fontFamily: T.ffMono,
          fontSize: 12.5,
          fontWeight: 600,
          color: T.brand,
          letterSpacing: "0.06em",
        }}
      >
        STEP {n}
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: T.ffDisplay,
          fontSize: 16,
          fontWeight: 700,
          color: T.ink,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: T.inkMuted,
        }}
      >
        {body}
      </div>
    </Card>
  );
}

function Persona({ icon: Icon, label }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: T.bgCanvas,
        border: `1px solid ${T.borderSoft}`,
        borderRadius: 10,
      }}
    >
      <Icon size={15} color={T.brand} />
      <span style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>
        {label}
      </span>
    </div>
  );
}

function fmtMoney(cents) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

// ── Page ────────────────────────────────────────────────────────────────
export default function PartnersApply() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const ctaHref = useMemo(() => {
    if (user) return "/app/affiliate";
    return `/signup?next=${encodeURIComponent("/app/affiliate")}`;
  }, [user]);

  function startApply() {
    if (loading) return;
    navigate(ctaHref);
  }

  // Static earnings example. Rates are confirmed at approval; we honor the
  // user's instruction "If rate unavailable, use 'up to 30%' copy only".
  // Starter plan = $99/mo, recurring 30% × 12 months.
  const exampleStarterMonthlyCents = 99 * 100 * 0.3;
  const exampleStarterAnnualCents = exampleStarterMonthlyCents * 12;

  return (
    <div
      style={{
        background: T.bgApp,
        minHeight: "100vh",
        fontFamily: T.ffBody,
        color: T.ink,
        paddingBottom: 80,
      }}
    >
      {/* Top bar — minimal. Logged-in users still see this. */}
      <div
        style={{
          padding: "20px 28px",
          borderBottom: `1px solid ${T.borderSoft}`,
          background: T.bgCanvas,
        }}
      >
        <Section style={{ padding: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <Link
              to="/"
              style={{
                fontFamily: T.ffDisplay,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: T.ink,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ color: T.brand }}>●</span> Logistic Intel
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <a
                href="mailto:partnerships@logisticintel.com"
                style={{
                  ...Btn.quiet,
                  color: T.inkSoft,
                  textDecoration: "none",
                }}
              >
                <Mail size={13} /> partnerships@logisticintel.com
              </a>
              <button
                type="button"
                onClick={startApply}
                style={Btn.primary}
              >
                Apply <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </Section>
      </div>

      {/* Hero */}
      <Section style={{ paddingTop: 64, paddingBottom: 56 }}>
        <div style={{ maxWidth: 760 }}>
          <Badge tone="brand" dot>
            Partner Program
          </Badge>
          <h1
            style={{
              marginTop: 18,
              fontFamily: T.ffDisplay,
              fontSize: 44,
              lineHeight: 1.05,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: T.ink,
            }}
          >
            Earn recurring revenue by referring logistics companies.
          </h1>
          <p
            style={{
              marginTop: 18,
              fontSize: 17,
              lineHeight: 1.55,
              color: T.inkMuted,
              maxWidth: 640,
            }}
          >
            Join the Logistic Intel Partner Program and earn recurring
            commission for every customer you bring to the platform.
            Built for consultants, advisors, and operators in freight
            and logistics.
          </p>
          <div
            style={{
              marginTop: 28,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={startApply}
              style={{ ...Btn.primary, padding: "12px 20px", fontSize: 14 }}
              disabled={loading}
            >
              Apply to become a partner <ArrowRight size={14} />
            </button>
            <a
              href="#how-it-works"
              style={{
                ...Btn.ghost,
                padding: "12px 20px",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              See how it works
            </a>
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 12.5,
              color: T.inkFaint,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ShieldCheck size={13} color={T.green} /> Reviewed within 2
            business days · Stripe Connect Express payouts
          </div>
        </div>
      </Section>

      {/* Value cards */}
      <Section style={{ paddingBottom: 56 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          <ValueCard
            icon={Coins}
            title="Recurring commission"
            body="Up to 30% of subscription revenue, paid monthly for 12 months on every customer you refer."
          />
          <ValueCard
            icon={FileText}
            title="Partner-ready sales materials"
            body="Vetted email templates, LinkedIn copy, and demo scripts you can use with shippers and freight teams."
          />
          <ValueCard
            icon={Users}
            title="Built for our market"
            body="Designed for logistics consultants, agencies, brokers, and operators with real shipper relationships."
          />
        </div>
      </Section>

      {/* How it works */}
      <Section style={{ paddingBottom: 56 }} id="how-it-works">
        <div style={{ marginBottom: 22 }}>
          <Badge tone="neutral">How it works</Badge>
          <h2
            style={{
              marginTop: 12,
              fontFamily: T.ffDisplay,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: T.ink,
            }}
          >
            Four steps from application to first payout.
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <StepCard n={1} title="Apply" body="Tell us about your audience and how you'd like to refer Logistic Intel." />
          <StepCard n={2} title="Get approved" body="Our partnerships team reviews every application within 2 business days." />
          <StepCard n={3} title="Share your link" body="Use your unique referral link in newsletters, demos, calls, and social." />
          <StepCard n={4} title="Earn" body="Recurring commission on every paid customer, paid monthly via Stripe." />
        </div>
      </Section>

      {/* Earnings example */}
      <Section style={{ paddingBottom: 56 }}>
        <Card style={{ padding: 28 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 28,
              alignItems: "center",
            }}
          >
            <div>
              <Badge tone="brand">Earnings example</Badge>
              <h3
                style={{
                  marginTop: 12,
                  fontFamily: T.ffDisplay,
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: T.ink,
                }}
              >
                What recurring 30% looks like.
              </h3>
              <p
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: T.inkMuted,
                  lineHeight: 1.6,
                }}
              >
                A single Starter plan customer ($99/month) earns you{" "}
                <strong style={{ color: T.ink }}>
                  {fmtMoney(exampleStarterMonthlyCents)}
                </strong>{" "}
                a month, or{" "}
                <strong style={{ color: T.ink }}>
                  {fmtMoney(exampleStarterAnnualCents)}
                </strong>{" "}
                over 12 months. Refer five customers and that's{" "}
                <strong style={{ color: T.ink }}>
                  {fmtMoney(exampleStarterAnnualCents * 5)}
                </strong>{" "}
                a year.
              </p>
              <p
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: T.inkFaint,
                  lineHeight: 1.55,
                }}
              >
                Estimates only — actual commission rate is confirmed at
                approval and shown on your partner dashboard.
              </p>
            </div>
            <div
              style={{
                background: T.bgSubtle,
                border: `1px solid ${T.borderSoft}`,
                borderRadius: 12,
                padding: 22,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <ExampleRow label="Per customer / month" value={fmtMoney(exampleStarterMonthlyCents)} />
                <ExampleRow label="Per customer / 12 mo" value={fmtMoney(exampleStarterAnnualCents)} />
                <ExampleRow label="5 customers / 12 mo" value={fmtMoney(exampleStarterAnnualCents * 5)} bold />
                <ExampleRow label="20 customers / 12 mo" value={fmtMoney(exampleStarterAnnualCents * 20)} bold />
              </div>
            </div>
          </div>
        </Card>
      </Section>

      {/* Who it's for */}
      <Section style={{ paddingBottom: 56 }}>
        <div style={{ marginBottom: 22 }}>
          <Badge tone="neutral">Who it's for</Badge>
          <h2
            style={{
              marginTop: 12,
              fontFamily: T.ffDisplay,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: T.ink,
            }}
          >
            Designed for the people closest to shippers.
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          <Persona icon={TrendingUp} label="Freight consultants" />
          <Persona icon={Award} label="Logistics advisors" />
          <Persona icon={Megaphone} label="Marketing agencies serving logistics" />
          <Persona icon={Users} label="Brokers & operators with shipper relationships" />
          <Persona icon={CheckCircle2} label="SaaS / referral partners" />
        </div>
      </Section>

      {/* Final CTA */}
      <Section style={{ paddingBottom: 0 }}>
        <Card
          style={{
            padding: 32,
            background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <div style={{ maxWidth: 560 }}>
              <h3
                style={{
                  fontFamily: T.ffDisplay,
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: T.ink,
                }}
              >
                Ready to start earning?
              </h3>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  color: T.inkMuted,
                  lineHeight: 1.55,
                }}
              >
                The application takes about 3 minutes. Approved partners
                are activated within 2 business days and can start sharing
                their referral link the same day.
              </p>
            </div>
            <button
              type="button"
              onClick={startApply}
              disabled={loading}
              style={{ ...Btn.primary, padding: "12px 20px", fontSize: 14 }}
            >
              Apply to become a partner <ArrowRight size={14} />
            </button>
          </div>
        </Card>
      </Section>
    </div>
  );
}

function ExampleRow({ label, value, bold }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12.5, color: T.inkSoft }}>{label}</span>
      <span
        style={{
          fontFamily: T.ffMono,
          fontSize: bold ? 18 : 15,
          fontWeight: bold ? 700 : 600,
          color: bold ? T.brandDeep : T.ink,
        }}
      >
        {value}
      </span>
    </div>
  );
}
