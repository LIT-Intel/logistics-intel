// Shared digest HTML render — single source of truth for the Pulse weekly
// digest email body. Imported by both:
//   - pulse-alert-digest (cron-driven weekly email)
//   - pulse-digest-preview (user-triggered dry-run from settings panel)
//
// Vendor-neutral copy: NEVER renders payload.matched_reasons (those strings
// can leak third-party data-source vendor names). The only permitted vendor
// name in the rendered email is "Freightos", which is the legally-required
// attribution for the Freightos Baltic Index benchmarks.
//
// v10 design — MOBILE-FIRST REBUILD
//   - 375px is the design canvas. Desktop is the @media (min-width:600px) layer.
//   - 560px max-width email shell (narrow = reads more editorial; no overflow risk).
//   - Warm paper outer bg (#F1F0EC) + warm off-white shell (#FFFBF6) — never sterile.
//   - Layered box-shadow replaces 1px section borders entirely.
//   - tabular-nums + white-space:nowrap on every dynamic number.
//   - 44px CTA tap targets (Apple HIG); concentric radii (16/12); font smoothing on.
//   - Hero stats stack to 3 rows on mobile (label left / value right) and revert
//     to 3 columns on desktop.

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

// Render an SVG icon in a specific accent color by injecting the color
// into the SVG's stroke. The icon's centerline sits below text baseline,
// so we nudge vertical-align by -3px for optical alignment with text.
function tintedIcon(svg: string, color: string, sizePx = 16): string {
  const sized = svg
    .replace(/width="14"/, `width="${sizePx}"`)
    .replace(/height="14"/, `height="${sizePx}"`)
    .replace(/vertical-align:middle;/, 'vertical-align:-3px;');
  return `<span style="color:${color}; display:inline-block; line-height:0; vertical-align:-3px;">${sized}</span>`;
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
// Brand palette — v10 warm-paper editorial
// ---------------------------------------------------------------------------

const NAVY = "#0B1220";
const NAVY_HI = "#1A2540";
const CYAN = "#00F0FF";

// Warm paper palette — no pure white surfaces
const BG_PAGE = "#F1F0EC";     // warm paper outer bg
const BG_SHELL = "#FFFBF6";    // warm off-white shell interior
const BG_CARD = "#FFFFFF";     // cards sit ON the warm shell

// Text
const TEXT = "#0F172A";
const TEXT_MUTED = "#475569";
const TEXT_FAINT = "#94A3B8";
const TEXT_DIM = "#64748B";

// Hairline (used only under section headings, never around cards)
const HAIRLINE = "#E2E8F0";

// Section accents
const C_VOLUME = "#2563EB";
const C_VOLUME_BG = "#EFF6FF";
const C_SHIPMENT = "#0891B2";
const C_SHIPMENT_BG = "#ECFEFF";
const C_LANE = "#7C3AED";
const C_LANE_BG = "#F5F3FF";
const C_BASELINE = "#D97706";
const C_BASELINE_BG = "#FFFBEB";
const C_BENCHMARK = "#0F766E";

// Delta pill colors
const POS = "#047857";
const POS_BG = "#ECFDF5";
const NEG = "#B91C1C";
const NEG_BG = "#FEF2F2";

// Drayage callout colors
const MONEY_BG = "#ECFDF5";
const MONEY_TEXT = "#065F46";

// Layered shadow used in place of card borders
const CARD_SHADOW = "0 1px 2px rgba(15,23,42,0.04), 0 2px 12px rgba(15,23,42,0.05)";

// Common style fragments
const TAB_NUM = "font-variant-numeric:tabular-nums; -moz-font-feature-settings:'tnum'; -webkit-font-feature-settings:'tnum'; font-feature-settings:'tnum'; white-space:nowrap;";
const IMG_OUTLINE = "outline:1px solid rgba(15,23,42,0.04); outline-offset:0;";

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
      rows: buckets.volume.map((a) => ({
        icon: tintedIcon(SERVICE_SVG.fcl, C_VOLUME),
        html: renderVolumeRow(a),
      })),
    }));
  }

  if (buckets.shipment.length > 0) {
    sections.push(renderSection({
      label: "Shipment Activity",
      count: buckets.shipment.length,
      color: C_SHIPMENT,
      rows: buckets.shipment.map((a) => ({
        icon: tintedIcon(SERVICE_SVG.fcl, C_SHIPMENT),
        html: renderShipmentRow(a),
      })),
    }));
  }

  if (buckets.lane.length > 0) {
    sections.push(renderSection({
      label: "New Trade Lanes",
      count: buckets.lane.length,
      color: C_LANE,
      rows: buckets.lane.map((a) => ({
        icon: tintedIcon(SERVICE_SVG.truck, C_LANE),
        html: renderLaneRow(a),
      })),
    }));
  }

  if (buckets.baseline.length > 0) {
    sections.push(renderSection({
      label: "Baseline Shifts",
      count: buckets.baseline.length,
      color: C_BASELINE,
      rows: buckets.baseline.map((a) => ({
        icon: tintedIcon(SERVICE_SVG.lcl, C_BASELINE),
        html: renderBaselineRow(a),
      })),
    }));
  }

  if (buckets.benchmark.length > 0) {
    sections.push(renderSection({
      label: "Benchmark Rate Movers",
      count: buckets.benchmark.length,
      color: C_BENCHMARK,
      rows: buckets.benchmark.map((a) => ({
        icon: tintedIcon(SERVICE_SVG.air, C_BENCHMARK),
        html: renderBenchmarkRow(a),
      })),
    }));
  }

  const headline = `${totalCount} ${totalCount === 1 ? "signal" : "signals"} across your saved companies`;
  const opportunityDisplay = totalOpportunityUsd > 0
    ? `$${Math.round(totalOpportunityUsd).toLocaleString("en-US")}`
    : "—";

  // Hero stats — mobile-default = stacked rows (label left / value right).
  // Each row is its own table so the "block" cells stack vertically without
  // wrapping. Desktop @media flips them back to a horizontal three-column row.
  const heroStats = `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;" class="lit-hero-stats">
              <tr>
                <td class="lit-stat-cell" valign="top" style="padding:14px 16px; background:rgba(0,240,255,0.08); border-radius:10px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td valign="middle" style="vertical-align:middle;">
                        <div style="font-size:11px; font-weight:700; letter-spacing:0.10em; text-transform:uppercase; color:${CYAN};">Total Opportunity</div>
                        <div style="font-size:11px; color:#94A3B8; margin-top:2px; line-height:16px;">Drayage est.</div>
                      </td>
                      <td valign="middle" align="right" style="vertical-align:middle; text-align:right; overflow:hidden;">
                        <div class="lit-hero-amt" style="font-family:Georgia,'Times New Roman',serif; font-size:28px; line-height:32px; color:#FFFFFF; font-weight:700; letter-spacing:-0.015em; ${TAB_NUM}">${htmlEscape(opportunityDisplay)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr><td class="lit-stat-gap-v" style="font-size:0; line-height:0; height:8px;">&nbsp;</td></tr>
              <tr>
                <td class="lit-stat-cell" valign="top" style="padding:12px 16px; background:rgba(255,255,255,0.05); border-radius:10px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td valign="middle" style="vertical-align:middle;">
                        <div style="font-size:11px; font-weight:700; letter-spacing:0.10em; text-transform:uppercase; color:#94A3B8;">Total Signals</div>
                        <div style="font-size:11px; color:#94A3B8; margin-top:2px; line-height:16px;">Past 14 days</div>
                      </td>
                      <td valign="middle" align="right" style="vertical-align:middle; text-align:right;">
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:22px; line-height:26px; color:#FFFFFF; font-weight:700; ${TAB_NUM}">${totalCount}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr><td class="lit-stat-gap-v" style="font-size:0; line-height:0; height:8px;">&nbsp;</td></tr>
              <tr>
                <td class="lit-stat-cell" valign="top" style="padding:12px 16px; background:rgba(255,255,255,0.05); border-radius:10px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td valign="middle" style="vertical-align:middle;">
                        <div style="font-size:11px; font-weight:700; letter-spacing:0.10em; text-transform:uppercase; color:#94A3B8;">Critical</div>
                        <div style="font-size:11px; color:#94A3B8; margin-top:2px; line-height:16px;">High-severity</div>
                      </td>
                      <td valign="middle" align="right" style="vertical-align:middle; text-align:right;">
                        <div style="font-family:Georgia,'Times New Roman',serif; font-size:22px; line-height:26px; color:${criticalCount > 0 ? "#FCA5A5" : "#FFFFFF"}; font-weight:700; ${TAB_NUM}">${criticalCount}</div>
                      </td>
                    </tr>
                  </table>
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
  /* Mobile is the default. Desktop is the enhancement layer. */
  @media only screen and (min-width: 600px) {
    .lit-pad-x { padding-left: 32px !important; padding-right: 32px !important; }
    .lit-pad-x-tight { padding-left: 28px !important; padding-right: 28px !important; }
    .lit-h1 { font-size: 28px !important; line-height: 36px !important; }
    .lit-hero-amt { font-size: 36px !important; line-height: 42px !important; }
    .lit-section-h { font-size: 19px !important; line-height: 26px !important; }
    .lit-row-name { font-size: 16px !important; line-height: 22px !important; }
    .lit-row-meta { font-size: 14px !important; line-height: 21px !important; }
    .lit-logo { height: 38px !important; }
    /* Hero stats — three columns side-by-side on desktop */
    .lit-hero-stats > tbody > tr { display: table-row !important; }
    .lit-hero-stats { display: table !important; table-layout: fixed; }
    .lit-stat-row-h { display: table-row !important; }
    .lit-stat-cell-h { display: table-cell !important; width: 33.333% !important; vertical-align: top; }
    /* Card metric pill back to the right on desktop */
    .lit-pill-wrap { text-align: right !important; padding-top: 0 !important; padding-left: 12px !important; }
    .lit-pill-col { display: table-cell !important; width: auto !important; vertical-align: top !important; }
    .lit-name-col { display: table-cell !important; width: auto !important; }
  }
  a { text-decoration: none; }
  img { -ms-interpolation-mode: bicubic; border: 0; line-height: 100%; outline: none; text-decoration: none; }
  /* Safe text-wrap balance — ignored gracefully by clients that don't support it. */
  .lit-balance { text-wrap: balance; -webkit-text-wrap: balance; }
  /* Outlook fallback for serif display numerals */
  .lit-display { mso-line-height-rule: exactly; }
</style>
</head>
<body style="margin:0; padding:0; background:${BG_PAGE}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; color:${TEXT};">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${headline} &middot; ${opportunityDisplay} in drayage opportunity this week.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG_PAGE};">
  <tr>
    <td align="center" style="padding:20px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="lit-shell" style="width:100%; max-width:560px; background:${BG_SHELL}; border-radius:16px; box-shadow:0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.08); overflow:hidden;">

        <!-- Header (dark gradient — founder approved) -->
        <tr>
          <td class="lit-pad-x" style="background:linear-gradient(135deg,${NAVY} 0%,${NAVY_HI} 100%); padding:22px 20px 24px 20px; border-bottom:2px solid ${CYAN};">
            <!-- Logo + date -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="middle" style="vertical-align:middle;">
                  <img src="https://app.logisticintel.com/logo_web_neon.png" alt="Logistics Intel" width="140" height="32" class="lit-logo" style="display:block; height:30px; width:auto; max-width:140px; border:0; ${IMG_OUTLINE}">
                </td>
                <td valign="middle" align="right" style="color:#94A3B8; font-size:10px; vertical-align:middle; letter-spacing:0.10em; text-transform:uppercase; font-weight:600; ${TAB_NUM}">${safeDate.replace(/ /g, "&nbsp;")}</td>
              </tr>
            </table>
            <!-- Eyebrow -->
            <div style="color:${CYAN}; font-size:10px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; margin-top:18px;">Weekly Pulse Digest</div>
            <!-- Headline (h1) -->
            <h1 class="lit-h1 lit-balance" style="color:#FFFFFF; font-family:Georgia,'Times New Roman',serif; font-size:22px; line-height:28px; margin:6px 0 0 0; font-weight:700; letter-spacing:-0.01em; text-wrap:balance;">${htmlEscape(headline)}<span style="color:${CYAN};">.</span></h1>
            <p style="color:#CBD5E1; font-size:13px; line-height:20px; margin:8px 0 0 0;">Hi ${safeFirst} — here's what moved across your saved companies in the past 14 days.</p>
            ${heroStats}
          </td>
        </tr>

        <!-- Body sections -->
        <tr>
          <td style="padding:0; background:${BG_SHELL};">
            ${sections.length > 0 ? sections.join("\n") : renderEmptyState()}
            ${renderTeamByline()}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="lit-pad-x" style="padding:22px 20px 26px 20px; background:${BG_PAGE}; border-top:1px solid ${HAIRLINE};">
            <p style="font-size:13px; line-height:19px; color:${TEXT}; margin:0 0 8px 0; font-weight:600;">Logistics Intel makes US import data actionable for freight brokers.</p>
            <p style="font-size:11px; line-height:17px; color:${TEXT_MUTED}; margin:0 0 12px 0;">Logistics Intel &middot; Atlanta,&nbsp;GA &middot; <a href="mailto:vraymond@logisticintel.com" style="color:${TEXT_MUTED};">vraymond@logisticintel.com</a></p>
            <p style="font-size:11px; line-height:17px; color:${TEXT_DIM}; margin:0;">
              You're receiving this weekly digest because you have saved companies in your Pulse Library.<br>
              <a href="${htmlEscape(unsubUrl)}" style="color:${C_VOLUME}; font-weight:600;">Unsubscribe</a>
              &nbsp;&middot;&nbsp;
              <a href="https://app.logisticintel.com/app/notifications" style="color:${C_VOLUME}; font-weight:600;">Manage preferences</a>
            </p>
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
// Sections + cards (v10 — shadow-only, mobile-stacked)
// ---------------------------------------------------------------------------

interface SectionRow {
  icon: string;
  html: string;
}

function renderSection(opts: {
  label: string;
  count: number;
  color: string;
  rows: SectionRow[];
}): string {
  // Each row is its own card with layered shadow (no border).
  const cards = opts.rows.map((row) => `
              <tr><td style="font-size:0; line-height:0; height:12px;">&nbsp;</td></tr>
              <tr>
                <td valign="top" style="vertical-align:top; padding:16px; background:${BG_CARD}; border-radius:12px; box-shadow:${CARD_SHADOW};">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td valign="top" width="24" style="vertical-align:top; width:24px; padding-right:10px;">${row.icon}</td>
                      <td valign="top" style="vertical-align:top;">${row.html}</td>
                    </tr>
                  </table>
                </td>
              </tr>`).join("");

  return `
        <tr>
          <td class="lit-pad-x" style="padding:24px 20px 0 20px;">
            <div class="lit-section-h" style="font-size:17px; line-height:24px; font-weight:700; color:${NAVY}; letter-spacing:-0.01em; margin:0 0 8px 0;">${htmlEscape(opts.label)} <span style="color:${TEXT_FAINT}; font-weight:600;">&mdash;</span> <span style="color:${opts.color}; font-weight:700; ${TAB_NUM}">${opts.count}</span></div>
            <div style="height:1px; line-height:0; font-size:0; background:${HAIRLINE};">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td class="lit-pad-x" style="padding:0 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${cards}
            </table>
          </td>
        </tr>`;
}

function renderEmptyState(): string {
  return `
        <tr>
          <td class="lit-pad-x" style="padding:40px 20px; text-align:center;">
            <div style="font-family:Georgia,'Times New Roman',serif; font-size:18px; color:${TEXT}; margin-bottom:6px;">All quiet this week.</div>
            <div style="font-size:13px; line-height:20px; color:${TEXT_MUTED};">No signal threshold breaches across your saved companies. We'll keep watching.</div>
          </td>
        </tr>`;
}

// Core card body — name on row 1, meta on row 2, pill row 3 (left-aligned mobile,
// right of name on desktop via @media), drayage callout row 4, CTA row 5.
function renderRowBody(opts: {
  name: string;
  loc: string;
  pillHtml: string;
  metaHtml: string;
  contextHtml?: string;
  moneyStripHtml?: string;
  ctaHref: string;
  ctaLabel: string;
  severity?: string;
}): string {
  const sevBadge = opts.severity === "critical"
    ? `<span style="display:inline-block; vertical-align:middle; margin-left:6px; padding:2px 6px; font-size:10px; font-weight:700; letter-spacing:0.06em; color:${NEG}; background:${NEG_BG}; border-radius:4px;">HIGH</span>`
    : "";
  const locChip = opts.loc
    ? `<span style="display:inline-block; vertical-align:middle; margin-left:6px; padding:2px 7px; font-size:11px; font-weight:500; color:${TEXT_MUTED}; background:#F8FAFC; border-radius:999px;">${opts.loc}</span>`
    : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td class="lit-name-col" valign="top" style="vertical-align:top; display:block; width:100%;">
                        <div class="lit-row-name" style="font-size:15px; font-weight:600; color:${TEXT}; line-height:20px; letter-spacing:-0.005em;">${opts.name}${locChip}${sevBadge}</div>
                        <div class="lit-row-meta" style="font-size:13px; color:${TEXT_MUTED}; margin-top:4px; line-height:20px;">${opts.metaHtml}</div>
                        ${opts.contextHtml || ""}
                      </td>
                      <td class="lit-pill-col" valign="top" style="display:block; width:100%; vertical-align:top;">
                        <div class="lit-pill-wrap" style="padding-top:10px; text-align:left; max-width:100%; overflow:hidden;">${opts.pillHtml}</div>
                      </td>
                    </tr>
                  </table>
                  ${opts.moneyStripHtml || ""}
                  <div style="margin-top:14px;">
                    <a href="${opts.ctaHref}" style="display:inline-block; padding:12px 18px; font-size:13px; font-weight:600; line-height:20px; color:#FFFFFF; background:${NAVY}; border-radius:8px; text-decoration:none; box-shadow:0 1px 2px rgba(15,23,42,0.08);">${opts.ctaLabel} <span style="color:${CYAN};">&rarr;</span></a>
                  </div>`;
}

// Team byline strip — small LIT mark + name + tagline. Sits between sections
// and the footer to give the email a human signature.
function renderTeamByline(): string {
  return `
        <tr>
          <td class="lit-pad-x" style="padding:28px 20px 22px 20px;">
            <div style="height:1px; line-height:0; font-size:0; background:${HAIRLINE}; margin:0 0 16px 0;">&nbsp;</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="middle" width="32" style="vertical-align:middle; width:32px; padding-right:10px;">
                  <img src="https://app.logisticintel.com/logo_email.png" alt="Logistics Intel" width="22" height="22" style="display:block; width:22px; height:22px; border:0; ${IMG_OUTLINE}">
                </td>
                <td valign="middle" style="vertical-align:middle;">
                  <div style="font-size:12px; line-height:18px; color:${TEXT};"><strong style="color:${NAVY}; font-weight:700;">Team LIT</strong> <span style="color:${TEXT_FAINT};">&middot;</span> <span style="color:${TEXT_MUTED};">From the team at Logistics Intel</span></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

// ---------------------------------------------------------------------------
// Pills + drayage callout
// ---------------------------------------------------------------------------

function pctPill(pct: any): string {
  if (typeof pct !== "number" || !isFinite(pct)) return "";
  const isNeg = pct < 0;
  const color = isNeg ? NEG : POS;
  const bg = isNeg ? NEG_BG : POS_BG;
  return `<span style="display:inline-block; padding:5px 11px; font-size:13px; font-weight:700; color:${color}; background:${bg}; border-radius:999px; max-width:100%; overflow:hidden; ${TAB_NUM}">${htmlEscape(formatPct(pct))}</span>`;
}

function countPill(n: any, label: string, color: string, bg: string): string {
  const num = typeof n === "number" && isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";
  return `<span style="display:inline-block; padding:5px 11px; font-size:13px; font-weight:700; color:${color}; background:${bg}; border-radius:999px; max-width:100%; overflow:hidden; ${TAB_NUM}"><strong style="font-weight:800;">${htmlEscape(num)}</strong> <span style="font-weight:500; opacity:0.8;">${htmlEscape(label)}</span></span>`;
}

function moneyStrip(amountUsd: number, lowUsd: number | undefined, highUsd: number | undefined, containers: number | undefined): string {
  const amt = `$${Math.round(amountUsd).toLocaleString("en-US")}`;
  const range = (typeof lowUsd === "number" && typeof highUsd === "number" && isFinite(lowUsd) && isFinite(highUsd))
    ? ` <span style="opacity:0.75; ${TAB_NUM}">(${Math.round(lowUsd).toLocaleString("en-US")}&ndash;${Math.round(highUsd).toLocaleString("en-US")})</span>`
    : "";
  const ctrs = (typeof containers === "number" && containers > 0)
    ? ` <span style="opacity:0.75;">&middot;</span> <span style="${TAB_NUM}">${containers}&nbsp;container${containers === 1 ? "" : "s"}</span>`
    : "";
  const bullet = `<span style="display:inline-block; width:6px; height:6px; background:${MONEY_TEXT}; border-radius:999px; vertical-align:middle; margin-right:8px;"></span>`;
  return `<div style="margin-top:12px; padding:10px 12px; background:${MONEY_BG}; border-radius:8px; font-size:13px; color:${MONEY_TEXT}; line-height:19px; font-weight:600;">${bullet}<span style="${TAB_NUM}">${htmlEscape(amt)}</span> drayage opportunity${range}${ctrs}</div>`;
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
  if (p.pod) contextParts.push(`POD&nbsp;${htmlEscape(p.pod)}`);
  if (p.final_dest) contextParts.push(`Final&nbsp;dest&nbsp;${htmlEscape(p.final_dest)}`);
  if (p.next_arrival_date) {
    contextParts.push(`Next&nbsp;arrival&nbsp;${htmlEscape(new Date(p.next_arrival_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}`);
  }
  const contextHtml = contextParts.length
    ? `<div style="font-size:12px; color:${TEXT_FAINT}; margin-top:6px; line-height:17px;">${contextParts.join('  &middot;  ')}</div>`
    : '';

  const moneyHtml = (typeof p.drayage_est_usd === 'number' && p.drayage_est_usd > 0)
    ? moneyStrip(p.drayage_est_usd, p.drayage_est_low_usd, p.drayage_est_high_usd, p.drayage_container_count)
    : '';

  return renderRowBody({
    name,
    loc,
    pillHtml: pctPill(p.pct_delta),
    metaHtml: `<strong style="color:${TEXT}; font-weight:700; ${TAB_NUM}">${before}&nbsp;&rarr;&nbsp;${after} shipments</strong> &middot; volume change`,
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
  const newCountText = typeof newCount === "number" && isFinite(newCount)
    ? Math.round(newCount).toLocaleString("en-US")
    : "—";

  return renderRowBody({
    name,
    loc,
    pillHtml: countPill(newCount, "shipments", C_SHIPMENT, C_SHIPMENT_BG),
    metaHtml: `<strong style="color:${TEXT}; font-weight:700; ${TAB_NUM}">${htmlEscape(newCountText)}&nbsp;new shipments</strong> detected in the past 14 days`,
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

  return renderRowBody({
    name,
    loc,
    pillHtml: countPill(newCount, "new", C_LANE, C_LANE_BG),
    metaHtml: `Started shipping on a new lane &middot; <strong style="color:${TEXT}; font-weight:700;">${origin}&nbsp;&rarr;&nbsp;${dest}</strong>`,
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

  return renderRowBody({
    name,
    loc,
    pillHtml: pctPill(p.pct_delta),
    metaHtml: `Baseline shift &middot; <strong style="color:${TEXT}; font-weight:700; ${TAB_NUM}">${before}&nbsp;&rarr;&nbsp;${after} shipments</strong>`,
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
  // For benchmark rates, "down" is good for shippers (green); "up" is bad (red).
  const pct = p.pct_delta;
  let pctPillHtml = "";
  if (typeof pct === "number" && isFinite(pct)) {
    const isUp = pct >= 0;
    const color = isUp ? NEG : POS;
    const bg = isUp ? NEG_BG : POS_BG;
    pctPillHtml = `<span style="display:inline-block; padding:5px 11px; font-size:13px; font-weight:700; color:${color}; background:${bg}; border-radius:999px; max-width:100%; overflow:hidden; ${TAB_NUM}">${htmlEscape(formatPct(pct))}&nbsp;WoW</span>`;
  }

  // Benchmark cards: no company, no CTA. Freightos attribution MANDATORY.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td class="lit-name-col" valign="top" style="vertical-align:top; display:block; width:100%;">
                        <div class="lit-row-name" style="font-size:15px; font-weight:600; color:${TEXT}; line-height:20px; letter-spacing:-0.005em;">${title}</div>
                        <div class="lit-row-meta" style="font-size:13px; color:${TEXT_MUTED}; margin-top:4px; line-height:20px;"><strong style="color:${TEXT}; font-weight:700; ${TAB_NUM}">${before}&nbsp;&rarr;&nbsp;${after}</strong> ${unit}</div>
                        <div style="font-size:11px; color:${TEXT_FAINT}; margin-top:8px; line-height:16px;">Source: Freightos&nbsp;Baltic&nbsp;Index</div>
                      </td>
                      <td class="lit-pill-col" valign="top" style="display:block; width:100%; vertical-align:top;">
                        <div class="lit-pill-wrap" style="padding-top:10px; text-align:left; max-width:100%; overflow:hidden;">${pctPillHtml}</div>
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
