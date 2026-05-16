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
// HTML structure mirrors docs/mockups/pulse-digest-sample.html.

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

  return buildDigestHtml({
    firstName,
    buckets,
    unsubUrl,
    dateLabel,
    totalCount: alerts.length,
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
}

function buildDigestHtml(args: DigestArgs): string {
  const { firstName, buckets, unsubUrl, dateLabel, totalCount } = args;

  const safeFirst = htmlEscape(firstName);
  const safeDate = htmlEscape(dateLabel);

  const sections: string[] = [];

  if (buckets.volume.length > 0) {
    sections.push(renderSection({
      label: `VOLUME ALERTS · ${buckets.volume.length}`,
      labelColor: "#3B82F6",
      rows: buckets.volume.map(renderVolumeRow),
    }));
  }

  if (buckets.shipment.length > 0) {
    sections.push(renderSection({
      label: `SHIPMENT ACTIVITY · ${buckets.shipment.length}`,
      labelColor: "#0EA5E9",
      rows: buckets.shipment.map(renderShipmentRow),
    }));
  }

  if (buckets.lane.length > 0) {
    sections.push(renderSection({
      label: `NEW TRADE LANES · ${buckets.lane.length}`,
      labelColor: "#8B5CF6",
      rows: buckets.lane.map(renderLaneRow),
    }));
  }

  if (buckets.baseline.length > 0) {
    sections.push(renderSection({
      label: `BASELINE SHIFTS · ${buckets.baseline.length}`,
      labelColor: "#F59E0B",
      rows: buckets.baseline.map(renderBaselineRow),
    }));
  }

  if (buckets.benchmark.length > 0) {
    sections.push(renderSection({
      label: `BENCHMARK RATE MOVERS · ${buckets.benchmark.length}`,
      labelColor: "#0891B2",
      rows: buckets.benchmark.map(renderBenchmarkRow),
    }));
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Your Pulse Digest — Logistic Intel</title>
<style>
  /* Mobile-first overrides — supported by Apple Mail, iOS Mail, Gmail (app + web), Outlook 365 web. */
  @media only screen and (max-width: 600px) {
    .lit-shell { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
    .lit-pad-x { padding-left: 18px !important; padding-right: 18px !important; }
    .lit-pad-x-tight { padding-left: 14px !important; padding-right: 14px !important; }
    .lit-h1 { font-size: 20px !important; line-height: 26px !important; }
    .lit-meta { display: block !important; text-align: left !important; padding-top: 8px !important; }
    .lit-logo { height: 32px !important; }
    .lit-row-name { font-size: 15px !important; }
    .lit-row-meta { font-size: 12px !important; }
    .lit-stack { display: block !important; width: 100% !important; }
  }
  /* Dark-mode email client tweaks — keep brand contrast in dark mode (Apple Mail dark). */
  @media (prefers-color-scheme: dark) {
    .lit-darkmode-keep { background-color: #ffffff !important; }
  }
  a { text-decoration: none; }
  img { -ms-interpolation-mode: bicubic; border: 0; line-height: 100%; outline: none; text-decoration: none; }
</style>
</head>
<body style="margin:0; padding:0; background:#F1F5F9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">Hi ${safeFirst} — ${totalCount} ${totalCount === 1 ? "signal" : "signals"} across your saved companies this week.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F1F5F9;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="760" class="lit-shell lit-darkmode-keep" style="width:100%; max-width:760px; background:#ffffff; border-radius:16px; box-shadow:0 6px 24px rgba(15,23,42,0.08); overflow:hidden;">

        <!-- Header -->
        <tr>
          <td class="lit-pad-x" style="background:linear-gradient(135deg,#0B1220 0%,#111B2E 55%,#1A2540 100%); padding:28px 36px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td class="lit-stack" style="vertical-align:middle;">
                  <img src="https://app.logisticintel.com/logo_email_clean.png" alt="Logistic Intel" width="180" height="40" class="lit-logo" style="display:block; height:40px; width:auto; max-width:180px; border:0; outline:none;">
                </td>
                <td class="lit-stack lit-meta" align="right" style="color:#94A3B8; font-size:12px; vertical-align:middle; letter-spacing:0.04em;">Weekly digest &middot; ${safeDate}</td>
              </tr>
            </table>
            <h1 class="lit-h1" style="color:#ffffff; font-size:26px; line-height:32px; margin:22px 0 6px 0; font-weight:700;">Hi ${safeFirst} &mdash; ${totalCount} ${totalCount === 1 ? "signal" : "signals"} across your saved companies this week</h1>
            <p style="color:#CBD5E1; font-size:14px; line-height:21px; margin:0;">Volume changes, new shipment activity, and trade-lane shifts from the past 14 days.</p>
          </td>
        </tr>

        ${sections.join("\n")}

        <!-- Footer -->
        <tr>
          <td class="lit-pad-x" style="padding:28px 36px; background:#F8FAFC; border-top:1px solid #E2E8F0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>
                  <img src="https://app.logisticintel.com/logo_email_clean.png" alt="Logistic Intel" width="120" height="27" style="display:block; height:27px; width:auto; max-width:120px; opacity:0.7; border:0; outline:none; margin-bottom:10px;">
                  <p style="font-size:12px; line-height:18px; color:#64748B; margin:0 0 8px 0;">Logistic Intel &middot; Atlanta, GA &middot; Trade intelligence for freight brokers</p>
                  <p style="font-size:11px; line-height:16px; color:#94A3B8; margin:0;">
                    You're receiving this weekly digest because you have saved companies in your Pulse Library.
                    <a href="https://app.logisticintel.com/app/notifications" style="color:#3B82F6;">Manage preferences</a> &middot;
                    <a href="${htmlEscape(unsubUrl)}" style="color:#3B82F6;">Unsubscribe</a>
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

function renderSection(opts: { label: string; labelColor: string; rows: string[] }): string {
  const rowCount = opts.rows.length;
  const stitched = opts.rows.map((row, i) => {
    const isLast = i === rowCount - 1;
    return `
              <tr>
                <td class="lit-pad-x-tight" style="padding:16px 18px;${isLast ? "" : " border-bottom:1px solid #F1F5F9;"}">
                  ${row}
                </td>
              </tr>`;
  }).join("");

  return `
        <tr>
          <td class="lit-pad-x" style="padding:20px 36px 10px 36px;">
            <div style="display:inline-block; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${opts.labelColor};">${htmlEscape(opts.label)}</div>
          </td>
        </tr>
        <tr>
          <td class="lit-pad-x" style="padding:0 36px 18px 36px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #E2E8F0; border-radius:12px; background:#ffffff;">${stitched}
            </table>
          </td>
        </tr>`;
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
  const pctStr = formatPct(p.pct_delta);
  const pctColor = (typeof p.pct_delta === "number" && p.pct_delta < 0) ? "#DC2626" : "#16A34A";
  const sevTag = renderSeverity(alert.severity);
  const locPart = loc ? `${loc} · ` : "";
  const contextLine = [];
  if (p.pod) contextLine.push(`POD: ${htmlEscape(p.pod)}`);
  if (p.final_dest) contextLine.push(`Final dest: ${htmlEscape(p.final_dest)}`);
  if (p.next_arrival_date) {
    contextLine.push(`Next arrival: ${htmlEscape(new Date(p.next_arrival_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}`);
  }
  const contextHtml = contextLine.length
    ? `<div style="font-size:11px; color:#94A3B8; margin-top:4px;">${contextLine.join(' · ')}</div>`
    : '';
  const opportunity = (typeof p.drayage_est_usd === 'number' && p.drayage_est_usd > 0)
    ? `<div style="font-size:11px; color:#0F172A; margin-top:6px;"><strong>Drayage opportunity:</strong> $${Math.round(p.drayage_est_usd).toLocaleString('en-US')} (${Math.round(p.drayage_est_low_usd || 0).toLocaleString('en-US')}–${Math.round(p.drayage_est_high_usd || 0).toLocaleString('en-US')}, ${p.drayage_container_count} containers)</div>`
    : '';
  return `<div class="lit-row-name" style="font-size:14px; font-weight:600; color:#0F172A;">${name}</div>
                  <div class="lit-row-meta" style="font-size:13px; color:#475569; margin-top:3px; line-height:18px;">${locPart}${before} → ${after} shipments · <span style="color:${pctColor}; font-weight:bold;">${pctStr}</span>${sevTag}</div>
                  ${contextHtml}
                  ${opportunity}
                  <a href="https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>`;
}

function renderShipmentRow(alert: DigestAlert): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const newCount = formatNum(p.new_shipments ?? p.after ?? p.abs_delta);
  const sevTag = renderSeverity(alert.severity);
  const locPart = loc ? `${loc} · ` : "";
  return `<div class="lit-row-name" style="font-size:14px; font-weight:600; color:#0F172A;">${name}</div>
                  <div class="lit-row-meta" style="font-size:13px; color:#475569; margin-top:3px; line-height:18px;">${locPart}<strong style="color:#0F172A;">${newCount}</strong> new shipments in the past 14 days${sevTag}</div>
                  <a href="https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>`;
}

function renderLaneRow(alert: DigestAlert): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const origin = htmlEscape(p.origin || p.lane_origin || "new origin");
  const dest = htmlEscape(p.destination || p.lane_destination || p.destination_city || "destination");
  const newCount = formatNum(p.new_shipments ?? p.after ?? p.abs_delta);
  const sevTag = renderSeverity(alert.severity);
  const prefix = loc ? `${loc} started shipping from ` : "started shipping from ";
  return `<div class="lit-row-name" style="font-size:14px; font-weight:600; color:#0F172A;">${name}</div>
                  <div class="lit-row-meta" style="font-size:13px; color:#475569; margin-top:3px; line-height:18px;">${prefix}<strong style="color:#0F172A;">${origin} → ${dest}</strong> · ${newCount} new shipments${sevTag}</div>
                  <a href="https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>`;
}

function renderBaselineRow(alert: DigestAlert): string {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const before = formatNum(p.before);
  const after = formatNum(p.after);
  const pctStr = formatPct(p.pct_delta);
  const sevTag = renderSeverity(alert.severity);
  const locPart = loc ? `${loc} · ` : "";
  return `<div class="lit-row-name" style="font-size:14px; font-weight:600; color:#0F172A;">${name}</div>
                  <div class="lit-row-meta" style="font-size:13px; color:#475569; margin-top:3px; line-height:18px;">${locPart}Baseline shift · ${before} → ${after} shipments · <span style="color:#0F172A; font-weight:bold;">${pctStr}</span>${sevTag}</div>
                  <a href="https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>`;
}

function renderBenchmarkRow(alert: DigestAlert): string {
  const p = alert.payload || {};
  const indexCode = htmlEscape(p.index_code || p.code || "FBX");
  const lane = htmlEscape(p.lane || p.lane_name || "");
  const title = lane ? `${indexCode} · ${lane}` : indexCode;
  const before = formatMoney(p.before);
  const after = formatMoney(p.after);
  const unit = htmlEscape(p.unit || "per 40HC");
  const pctStr = formatPct(p.pct_delta);
  const pctColor = (typeof p.pct_delta === "number" && p.pct_delta < 0) ? "#16A34A" : "#DC2626";
  // Freightos attribution is MANDATORY for benchmark rows (legal ToS).
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${title}</div>
                  <div class="lit-row-meta" style="font-size:13px; color:#475569; margin-top:3px; line-height:18px;">${before} → ${after} ${unit} · <span style="color:${pctColor}; font-weight:bold;">${pctStr}</span> WoW</div>
                  <div style="font-size:11px; color:#94A3B8; margin-top:6px;">Source: Freightos Baltic Index</div>`;
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
  return htmlEscape(`${sign}${pct.toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%`);
}

function renderSeverity(sev: any): string {
  if (sev === "critical") return ` · <span style="color:#DC2626; font-weight:bold;">HIGH</span>`;
  if (sev === "warning") return ``;
  return ``;
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
