// Shared digest HTML render — single source of truth for the Pulse weekly
// digest email body. Imported by both:
//   - pulse-alert-digest (cron-driven weekly email)
//   - pulse-digest-preview (user-triggered dry-run from settings panel)
//
// Vendor-neutral copy: NEVER renders payload.matched_reasons (those strings
// can leak third-party data-source vendor names). The only permitted vendor
// name in the rendered email is "Freightos", which is the legally-required
// attribution for the Freightos Baltic Index benchmarks.

// Inline SVGs for email — lucide-react path strings.
const SERVICE_SVG: Record<string, string> = {
  fcl: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M2 21c.6.5 1.2 1 2.5 1c2.5 0 2.5-2 5-2c1.3 0 1.9.5 2.5 1c.6.5 1.2 1 2.5 1c2.5 0 2.5-2 5-2c1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/></svg>',
  lcl: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  air: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M17.8 19.2 16 11 3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
  truck: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
};

export function serviceIconSvg(mode: 'fcl' | 'lcl' | 'air' | 'truck'): string {
  return SERVICE_SVG[mode] || SERVICE_SVG.fcl;
}

export type DigestAlertType = "volume" | "shipment" | "lane" | "benchmark" | "baseline";

export interface DigestAlert {
  alert_type: DigestAlertType;
  severity?: string;
  payload: Record<string, any>;
}

export interface RenderDigestArgs {
  firstName: string;
  alerts: DigestAlert[];
  unsubscribeToken: string;
  dateLabel?: string;
}

export function renderDigestHtml(args: RenderDigestArgs): string {
  const firstName = args.firstName || "there";
  const unsubscribeToken = args.unsubscribeToken || "";
  const alerts = args.alerts || [];
  const dateLabel =
    args.dateLabel ||
    new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const buckets = {
    volume: alerts.filter((a) => a.alert_type === "volume"),
    shipment: alerts.filter((a) => a.alert_type === "shipment"),
    lane: alerts.filter((a) => a.alert_type === "lane"),
    benchmark: alerts.filter((a) => a.alert_type === "benchmark"),
    baseline: alerts.filter((a) => a.alert_type === "baseline"),
  };
  const unsubUrl = `https://www.logisticintel.com/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  // Aggregate stats — total $ opportunity is the hero number. Sum across all
  // alert buckets that might carry a drayage_est_usd (volume primarily, but
  // we tolerate the field on any payload).
  let totalOpportunityUsd = 0;
  let criticalCount = 0;
  for (const a of alerts) {
    const usd = a?.payload?.drayage_est_usd;
    if (typeof usd === "number" && isFinite(usd) && usd > 0) totalOpportunityUsd += usd;
    if (a?.severity === "critical") criticalCount += 1;
  }

  return buildDigestHtml({
    firstName,
    buckets,
    unsubUrl,
    dateLabel,
    totalCount: alerts.length,
    totalOpportunityUsd,
    criticalCount,
  });
}

// ---------------------------------------------------------------------------
// Internal: HTML template
// ---------------------------------------------------------------------------

interface DigestArgs {
  firstName: string;
  buckets: {
    volume: DigestAlert[];
    shipment: DigestAlert[];
    lane: DigestAlert[];
    benchmark: DigestAlert[];
    baseline: DigestAlert[];
  };
  unsubUrl: string;
  dateLabel: string;
  totalCount: number;
  totalOpportunityUsd: number;
  criticalCount: number;
}

// Brand palette
const NAVY = "#0B1220";
const NAVY_MID = "#111B2E";
const NAVY_HI = "#1A2540";
const CYAN = "#00F0FF";
const TEXT = "#0F172A";
const TEXT_MUTED = "#475569";
const TEXT_FAINT = "#94A3B8";
const HAIRLINE = "#E2E8F0";
const SURFACE = "#FFFFFF";
const SURFACE_ALT = "#F8FAFC";
const BG = "#EEF2F7";

// Section accents
const C_VOLUME = "#2563EB";       // blue
const C_VOLUME_BG = "#EFF6FF";
const C_SHIPMENT = "#0891B2";     // cyan-700
const C_SHIPMENT_BG = "#ECFEFF";
const C_LANE = "#7C3AED";         // violet
const C_LANE_BG = "#F5F3FF";
const C_BASELINE = "#D97706";     // amber-600
const C_BASELINE_BG = "#FFFBEB";
const C_BENCHMARK = "#0F766E";    // teal-700
const C_BENCHMARK_BG = "#F0FDFA";

const POS = "#047857";            // emerald-700 (text on light pill)
const POS_BG = "#ECFDF5";
const NEG = "#B91C1C";            // red-700
const NEG_BG = "#FEF2F2";
const MONEY_BG = "#ECFDF5";
const MONEY_TEXT = "#065F46";

function buildDigestHtml(args: DigestArgs): string {
  const { firstName, buckets, unsubUrl, dateLabel, totalCount, totalOpportunityUsd, criticalCount } = args;

  const safeFirst = htmlEscape(firstName);
  const safeDate = htmlEscape(dateLabel);

  const sections: string[] = [];

  if (buckets.volume.length > 0) {
    sections.push(renderSection({
      label: "Volume Alerts",
      count: buckets.volume.length,
      color: C_VOLUME,
      bg: C_VOLUME_BG,
      rows: buckets.volume.map(renderVolumeRow),
    }));
  }

  if (buckets.shipment.length > 0) {
    sections.push(renderSection({
      label: "Shipment Activity",
      count: buckets.shipment.length,
      color: C_SHIPMENT,
      bg: C_SHIPMENT_BG,
      rows: buckets.shipment.map(renderShipmentRow),
    }));
  }

  if (buckets.lane.length > 0) {
    sections.push(renderSection({
      label: "New Trade Lanes",
      count: buckets.lane.length,
      color: C_LANE,
      bg: C_LANE_BG,
      rows: buckets.lane.map(renderLaneRow),
    }));
  }

  if (buckets.baseline.length > 0) {
    sections.push(renderSection({
      label: "Baseline Shifts",
      count: buckets.baseline.length,
      color: C_BASELINE,
      bg: C_BASELINE_BG,
      rows: buckets.baseline.map(renderBaselineRow),
    }));
  }

  if (buckets.benchmark.length > 0) {
    sections.push(renderSection({
      label: "Benchmark Rate Movers",
      count: buckets.benchmark.length,
      color: C_BENCHMARK,
      bg: C_BENCHMARK_BG,
      rows: buckets.benchmark.map(renderBenchmarkRow),
    }));
  }

  const headline = `${totalCount} ${totalCount === 1 ? "signal" : "signals"} across your saved companies`;
  const opportunityDisplay = totalOpportunityUsd > 0
    ? `$${Math.round(totalOpportunityUsd).toLocaleString("en-US")}`
    : "—";

  // Stats strip — three-column table on desktop, two-column wrap on mobile.
  const statsStrip = `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:22px;">
              <tr>
                <td class="lit-stat lit-stat-hero" valign="top" width="40%" style="padding:14px 16px; background:rgba(0,240,255,0.06); border:1px solid rgba(0,240,255,0.22); border-radius:10px;">
                  <div style="font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${CYAN};">Total Opportunity</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:34px; color:#FFFFFF; font-weight:700; margin-top:6px; letter-spacing:-0.01em;">${htmlEscape(opportunityDisplay)}</div>
                  <div style="font-size:11px; color:#94A3B8; margin-top:2px;">Drayage est. across volume alerts</div>
                </td>
                <td class="lit-stat-gap" width="12" style="font-size:0; line-height:0;">&nbsp;</td>
                <td class="lit-stat" valign="top" width="29%" style="padding:14px 16px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10); border-radius:10px;">
                  <div style="font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#94A3B8;">Total Signals</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:30px; color:#FFFFFF; font-weight:700; margin-top:6px;">${totalCount}</div>
                  <div style="font-size:11px; color:#94A3B8; margin-top:2px;">Past 14 days</div>
                </td>
                <td class="lit-stat-gap" width="12" style="font-size:0; line-height:0;">&nbsp;</td>
                <td class="lit-stat" valign="top" width="29%" style="padding:14px 16px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10); border-radius:10px;">
                  <div style="font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#94A3B8;">Critical</div>
                  <div style="font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:30px; color:${criticalCount > 0 ? "#FCA5A5" : "#FFFFFF"}; font-weight:700; margin-top:6px;">${criticalCount}</div>
                  <div style="font-size:11px; color:#94A3B8; margin-top:2px;">High-severity alerts</div>
                </td>
              </tr>
            </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Your Pulse Digest — Logistics Intel</title>
<style>
  /* Mobile overrides — Apple Mail, iOS Mail, Gmail (app + web), Outlook 365 web. */
  @media only screen and (max-width: 600px) {
    .lit-shell { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
    .lit-pad-x { padding-left: 20px !important; padding-right: 20px !important; }
    .lit-pad-x-tight { padding-left: 16px !important; padding-right: 16px !important; }
    .lit-h1 { font-size: 20px !important; line-height: 27px !important; }
    .lit-meta { display: block !important; text-align: left !important; padding-top: 10px !important; }
    .lit-logo { height: 30px !important; }
    .lit-row-name { font-size: 15px !important; }
    .lit-row-meta { font-size: 12px !important; }
    .lit-stack { display: block !important; width: 100% !important; box-sizing: border-box; }
    .lit-pill-right { display: block !important; text-align: left !important; padding-top: 8px !important; padding-left: 0 !important; }
    /* Stats strip: hero full-width, then two equal-width below. Hide the gap spacers. */
    .lit-stat-hero { display: block !important; width: 100% !important; box-sizing: border-box; margin-bottom: 8px !important; }
    .lit-stat { display: inline-block !important; width: 48% !important; box-sizing: border-box; vertical-align: top; }
    .lit-stat-gap { display: none !important; }
    .lit-cta { display: block !important; text-align: center !important; }
  }
  a { text-decoration: none; }
  img { -ms-interpolation-mode: bicubic; border: 0; line-height: 100%; outline: none; text-decoration: none; }
  /* Outlook fallback for serif display numerals. */
  .lit-display { mso-line-height-rule: exactly; }
</style>
</head>
<body style="margin:0; padding:0; background:${BG}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; color:${TEXT};">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${headline} · ${opportunityDisplay} in drayage opportunity this week.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="760" class="lit-shell" style="width:100%; max-width:760px; background:${SURFACE}; border-radius:16px; box-shadow:0 10px 32px rgba(11,18,32,0.10); overflow:hidden;">

        <!-- Header -->
        <tr>
          <td class="lit-pad-x" style="background:linear-gradient(135deg,${NAVY} 0%,${NAVY_MID} 55%,${NAVY_HI} 100%); padding:24px 36px 28px 36px; border-bottom:2px solid ${CYAN};">
            <!-- Top bar: logo left, date right -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td class="lit-stack" style="vertical-align:middle;">
                  <img src="https://app.logisticintel.com/logo_web_neon.png" alt="Logistics Intel" width="160" height="46" class="lit-logo" style="display:block; height:38px; width:auto; max-width:160px; border:0; outline:none;">
                </td>
                <td class="lit-stack lit-meta" align="right" style="color:#94A3B8; font-size:11px; vertical-align:middle; letter-spacing:0.10em; text-transform:uppercase; font-weight:600;">Weekly Digest &middot; ${safeDate}</td>
              </tr>
            </table>
            <!-- Headline -->
            <h1 class="lit-h1" style="color:#FFFFFF; font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:32px; margin:18px 0 0 0; font-weight:700; letter-spacing:-0.01em;">${htmlEscape(headline)}<span style="color:${CYAN};">.</span></h1>
            <p style="color:#CBD5E1; font-size:13px; line-height:20px; margin:6px 0 0 0;">Hi ${safeFirst} — here's what moved across your saved companies in the past 14 days.</p>
            ${statsStrip}
          </td>
        </tr>

        ${sections.length > 0 ? sections.join("\n") : renderEmptyState()}

        <!-- Footer -->
        <tr>
          <td class="lit-pad-x" style="padding:28px 36px 32px 36px; background:${SURFACE_ALT}; border-top:1px solid ${HAIRLINE};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>
                  <img src="https://app.logisticintel.com/logo_email.png" alt="Logistics Intel" width="120" height="27" style="display:block; height:27px; width:auto; max-width:120px; opacity:0.7; border:0; outline:none; margin-bottom:14px;">
                  <p style="font-size:12px; line-height:18px; color:${TEXT_MUTED}; margin:0 0 4px 0; font-weight:600;">Logistics Intel</p>
                  <p style="font-size:11px; line-height:17px; color:${TEXT_FAINT}; margin:0 0 14px 0;">Trade intelligence for freight brokers &middot; Atlanta, GA</p>
                  <p style="font-size:11px; line-height:17px; color:${TEXT_FAINT}; margin:0;">
                    You're receiving this weekly digest because you have saved companies in your Pulse Library.<br>
                    <a href="https://app.logisticintel.com/app/notifications" style="color:${C_VOLUME}; font-weight:600;">Manage preferences</a>
                    &nbsp;&middot;&nbsp;
                    <a href="${htmlEscape(unsubUrl)}" style="color:${C_VOLUME}; font-weight:600;">Unsubscribe</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Section + card primitives
// ---------------------------------------------------------------------------

function renderSection(opts: {
  label: string;
  count: number;
  color: string;
  bg: string;
  rows: string[];
}): string {
  const rowCount = opts.rows.length;
  const stitched = opts.rows.map((row, i) => {
    const isLast = i === rowCount - 1;
    return `
              <tr>
                <td class="lit-pad-x-tight" style="padding:18px 20px;${isLast ? "" : ` border-bottom:1px solid ${HAIRLINE};`}">
                  ${row}
                </td>
              </tr>`;
  }).join("");

  // Pill badge with built-in count — replaces the tracked uppercase label.
  const pill = `<span style="display:inline-block; padding:5px 11px; font-size:11px; font-weight:700; letter-spacing:0.04em; color:${opts.color}; background:${opts.bg}; border:1px solid ${opts.color}22; border-radius:999px;">${htmlEscape(opts.label)} <span style="opacity:0.65;">·</span> ${opts.count}</span>`;

  return `
        <tr>
          <td class="lit-pad-x" style="padding:30px 36px 12px 36px;">
            ${pill}
          </td>
        </tr>
        <tr>
          <td class="lit-pad-x" style="padding:0 36px 4px 36px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${HAIRLINE}; border-radius:14px; background:${SURFACE}; box-shadow:0 1px 2px rgba(15,23,42,0.04);">${stitched}
            </table>
          </td>
        </tr>`;
}

function renderEmptyState(): string {
  return `
        <tr>
          <td class="lit-pad-x" style="padding:48px 36px; text-align:center;">
            <div style="font-family:Georgia,'Times New Roman',serif; font-size:18px; color:${TEXT}; margin-bottom:6px;">All quiet this week.</div>
            <div style="font-size:13px; color:${TEXT_MUTED};">No signal threshold breaches across your saved companies. We'll keep watching.</div>
          </td>
        </tr>`;
}

// Card scaffold: two-column row with company info left, metric pill right,
// followed by an optional context line, an optional money callout strip, then CTA.
function renderCard(opts: {
  name: string;
  loc: string;
  pillHtml: string;        // right-aligned metric pill(s)
  metaHtml: string;        // primary metadata line (sub-heading under name)
  contextHtml?: string;    // small extra context (POD, dest, etc.)
  moneyStripHtml?: string; // colored money callout strip at bottom
  ctaHref: string;
  ctaLabel: string;
  severity?: string;
}): string {
  const sevBadge = opts.severity === "critical"
    ? `<span style="display:inline-block; vertical-align:middle; margin-left:8px; padding:2px 7px; font-size:10px; font-weight:700; letter-spacing:0.06em; color:${NEG}; background:${NEG_BG}; border-radius:4px;">HIGH</span>`
    : "";
  const locChip = opts.loc
    ? `<span style="display:inline-block; vertical-align:middle; margin-left:8px; padding:2px 8px; font-size:11px; font-weight:500; color:${TEXT_MUTED}; background:${SURFACE_ALT}; border:1px solid ${HAIRLINE}; border-radius:999px;">${opts.loc}</span>`
    : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td class="lit-stack" valign="top" style="vertical-align:top;">
                        <div class="lit-row-name" style="font-size:16px; font-weight:600; color:${TEXT}; line-height:22px; letter-spacing:-0.005em;">${opts.name}${locChip}${sevBadge}</div>
                        <div class="lit-row-meta" style="font-size:13px; color:${TEXT_MUTED}; margin-top:5px; line-height:19px;">${opts.metaHtml}</div>
                        ${opts.contextHtml || ""}
                      </td>
                      <td class="lit-stack lit-pill-right" valign="top" align="right" style="vertical-align:top; padding-left:16px; white-space:nowrap;">
                        ${opts.pillHtml}
                      </td>
                    </tr>
                  </table>
                  ${opts.moneyStripHtml || ""}
                  <div style="margin-top:14px;">
                    <a class="lit-cta" href="${opts.ctaHref}" style="display:inline-block; padding:8px 14px; font-size:12px; font-weight:600; color:${TEXT}; background:${SURFACE}; border:1px solid ${HAIRLINE}; border-radius:8px; text-decoration:none;">${opts.ctaLabel} <span style="color:${C_VOLUME};">&rarr;</span></a>
                  </div>`;
}

// Pill helpers
function pctPill(pct: any): string {
  if (typeof pct !== "number" || !isFinite(pct)) return "";
  const isNeg = pct < 0;
  const color = isNeg ? NEG : POS;
  const bg = isNeg ? NEG_BG : POS_BG;
  return `<span style="display:inline-block; padding:5px 11px; font-size:13px; font-weight:700; color:${color}; background:${bg}; border:1px solid ${color}22; border-radius:999px;">${htmlEscape(formatPct(pct))}</span>`;
}

function countPill(n: any, label: string, color: string, bg: string): string {
  const num = typeof n === "number" && isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";
  return `<span style="display:inline-block; padding:5px 11px; font-size:13px; font-weight:700; color:${color}; background:${bg}; border:1px solid ${color}22; border-radius:999px;"><strong style="font-weight:800;">${htmlEscape(num)}</strong> <span style="font-weight:500; opacity:0.8;">${htmlEscape(label)}</span></span>`;
}

function moneyStrip(amountUsd: number, lowUsd: number | undefined, highUsd: number | undefined, containers: number | undefined): string {
  const amt = `$${Math.round(amountUsd).toLocaleString("en-US")}`;
  const range = (typeof lowUsd === "number" && typeof highUsd === "number" && isFinite(lowUsd) && isFinite(highUsd))
    ? ` <span style="opacity:0.75;">(${Math.round(lowUsd).toLocaleString("en-US")}–${Math.round(highUsd).toLocaleString("en-US")})</span>`
    : "";
  const ctrs = (typeof containers === "number" && containers > 0)
    ? ` <span style="opacity:0.75;">·</span> ${containers} container${containers === 1 ? "" : "s"}`
    : "";
  // Small leading bullet (styled circle) instead of emoji.
  const bullet = `<span style="display:inline-block; width:6px; height:6px; background:${MONEY_TEXT}; border-radius:999px; vertical-align:middle; margin-right:8px;"></span>`;
  return `<div style="margin-top:12px; padding:10px 14px; background:${MONEY_BG}; border:1px solid #A7F3D0; border-radius:8px; font-size:12px; color:${MONEY_TEXT}; line-height:18px;">${bullet}<strong style="font-weight:700;">${htmlEscape(amt)} drayage opportunity</strong>${range}${ctrs}</div>`;
}

// ---------------------------------------------------------------------------
// Row renderers — ONLY structured payload fields. NEVER matched_reasons.
// ---------------------------------------------------------------------------

function renderVolumeRow(alert: DigestAlert): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const before = formatNum(p.before);
  const after = formatNum(p.after);

  const contextParts: string[] = [];
  if (p.pod) contextParts.push(`POD ${htmlEscape(p.pod)}`);
  if (p.final_dest) contextParts.push(`Final dest ${htmlEscape(p.final_dest)}`);
  if (p.next_arrival_date) {
    contextParts.push(`Next arrival ${htmlEscape(new Date(p.next_arrival_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}`);
  }
  const contextHtml = contextParts.length
    ? `<div style="font-size:11px; color:${TEXT_FAINT}; margin-top:6px; line-height:16px;">${contextParts.join('  ·  ')}</div>`
    : '';

  const moneyHtml = (typeof p.drayage_est_usd === 'number' && p.drayage_est_usd > 0)
    ? moneyStrip(p.drayage_est_usd, p.drayage_est_low_usd, p.drayage_est_high_usd, p.drayage_container_count)
    : '';

  return renderCard({
    name,
    loc,
    pillHtml: pctPill(p.pct_delta),
    metaHtml: `<strong style="color:${TEXT}; font-weight:600;">${before} &rarr; ${after}</strong> shipments &middot; volume change`,
    contextHtml,
    moneyStripHtml: moneyHtml,
    ctaHref: `https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}`,
    ctaLabel: "View company",
    severity: alert.severity,
  });
}

function renderShipmentRow(alert: DigestAlert): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const newCount = p.new_shipments ?? p.after ?? p.abs_delta;

  return renderCard({
    name,
    loc,
    pillHtml: countPill(newCount, "shipments", C_SHIPMENT, C_SHIPMENT_BG),
    metaHtml: `New shipment activity detected in the past 14 days`,
    ctaHref: `https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}`,
    ctaLabel: "View company",
    severity: alert.severity,
  });
}

function renderLaneRow(alert: DigestAlert): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const origin = htmlEscape(p.origin || p.lane_origin || "new origin");
  const dest = htmlEscape(p.destination || p.lane_destination || p.destination_city || "destination");
  const newCount = p.new_shipments ?? p.after ?? p.abs_delta;

  return renderCard({
    name,
    loc,
    pillHtml: countPill(newCount, "new", C_LANE, C_LANE_BG),
    metaHtml: `Started shipping on a new lane &middot; <strong style="color:${TEXT}; font-weight:600;">${origin} &rarr; ${dest}</strong>`,
    ctaHref: `https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}`,
    ctaLabel: "View company",
    severity: alert.severity,
  });
}

function renderBaselineRow(alert: DigestAlert): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const before = formatNum(p.before);
  const after = formatNum(p.after);

  return renderCard({
    name,
    loc,
    pillHtml: pctPill(p.pct_delta),
    metaHtml: `Baseline shift &middot; <strong style="color:${TEXT}; font-weight:600;">${before} &rarr; ${after}</strong> shipments`,
    ctaHref: `https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}`,
    ctaLabel: "View company",
    severity: alert.severity,
  });
}

function renderBenchmarkRow(alert: DigestAlert): string {
  const p = alert.payload || {};
  const indexCode = htmlEscape(p.index_code || p.code || "FBX");
  const lane = htmlEscape(p.lane || p.lane_name || "");
  const title = lane ? `${indexCode} <span style="color:${TEXT_FAINT}; font-weight:500;">&middot;</span> ${lane}` : indexCode;
  const before = formatMoney(p.before);
  const after = formatMoney(p.after);
  const unit = htmlEscape(p.unit || "per 40HC");
  // For benchmark rates, "down" is good for shippers → green; "up" is bad → red.
  const pct = p.pct_delta;
  let pctPillHtml = "";
  if (typeof pct === "number" && isFinite(pct)) {
    const isUp = pct >= 0;
    const color = isUp ? NEG : POS;
    const bg = isUp ? NEG_BG : POS_BG;
    pctPillHtml = `<span style="display:inline-block; padding:5px 11px; font-size:13px; font-weight:700; color:${color}; background:${bg}; border:1px solid ${color}22; border-radius:999px;">${htmlEscape(formatPct(pct))} WoW</span>`;
  }

  // Benchmark cards have a different shape — no company, no CTA, but Freightos attribution is MANDATORY.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td class="lit-stack" valign="top" style="vertical-align:top;">
                        <div class="lit-row-name" style="font-size:16px; font-weight:600; color:${TEXT}; line-height:22px; letter-spacing:-0.005em;">${title}</div>
                        <div class="lit-row-meta" style="font-size:13px; color:${TEXT_MUTED}; margin-top:5px; line-height:19px;"><strong style="color:${TEXT}; font-weight:600;">${before} &rarr; ${after}</strong> ${unit}</div>
                        <div style="font-size:11px; color:${TEXT_FAINT}; margin-top:8px; line-height:16px;">Source: Freightos Baltic Index</div>
                      </td>
                      <td class="lit-stack lit-pill-right" valign="top" align="right" style="vertical-align:top; padding-left:16px; white-space:nowrap;">
                        ${pctPillHtml}
                      </td>
                    </tr>
                  </table>`;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatLocation(payload: any): string {
  const city = payload?.city ? String(payload.city).trim() : "";
  const state = payload?.state ? String(payload.state).trim() : "";
  if (city && state) return htmlEscape(`${city}, ${state}`);
  if (city) return htmlEscape(city);
  if (state) return htmlEscape(state);
  return "";
}

function formatNum(n: any): string {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return htmlEscape(Math.round(n).toLocaleString("en-US"));
}

function formatMoney(n: any): string {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return htmlEscape(`$${Math.round(n).toLocaleString("en-US")}`);
}

function formatPct(n: any): string {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  const pct = n * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%`;
}

function htmlEscape(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
