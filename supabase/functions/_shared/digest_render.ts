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
<title>Your Pulse Digest — Logistic Intel</title>
</head>
<body style="margin:0; padding:0; background:#F8FAFC; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F8FAFC;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="max-width:680px; background:#ffffff; border-radius:14px; box-shadow:0 4px 16px rgba(15,23,42,0.06); overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%); padding:24px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>
                  <div style="display:inline-block; width:32px; height:32px; background:radial-gradient(circle at 30% 30%, rgba(0,240,255,0.32), transparent 65%), linear-gradient(135deg,#0F172A 0%,#1E293B 100%); border-radius:8px; vertical-align:middle; text-align:center; line-height:32px; color:#00F0FF; font-weight:bold;">L</div>
                  <span style="color:#ffffff; font-size:18px; font-weight:bold; margin-left:10px; vertical-align:middle;">Logistic Intel</span>
                </td>
                <td align="right" style="color:#94A3B8; font-size:12px;">Weekly digest · ${safeDate}</td>
              </tr>
            </table>
            <h1 style="color:#ffffff; font-size:24px; line-height:30px; margin:18px 0 4px 0;">Hi ${safeFirst} — ${totalCount} ${totalCount === 1 ? "signal" : "signals"} across your saved companies this week</h1>
            <p style="color:#CBD5E1; font-size:14px; line-height:20px; margin:0;">Volume changes, new shipment activity, and trade-lane shifts from the past 14 days.</p>
          </td>
        </tr>

        ${sections.join("\n")}

        <!-- Footer -->
        <tr>
          <td style="padding:24px 28px; background:#F8FAFC; border-top:1px solid #E2E8F0;">
            <p style="font-size:12px; line-height:18px; color:#64748B; margin:0 0 8px 0;">Logistic Intel · Atlanta, GA</p>
            <p style="font-size:11px; line-height:16px; color:#94A3B8; margin:0;">
              You're receiving this weekly digest because you have saved companies in your Pulse Library.
              <a href="https://app.logisticintel.com/app/notifications" style="color:#3B82F6;">Manage preferences</a> ·
              <a href="${htmlEscape(unsubUrl)}" style="color:#3B82F6;">Unsubscribe</a>
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

function renderSection(opts: { label: string; labelColor: string; rows: string[] }): string {
  // Stitch row HTMLs together inside the bordered card. Each rendered row
  // already contains its own border-bottom for separation except the last.
  const rowCount = opts.rows.length;
  const stitched = opts.rows.map((row, i) => {
    const isLast = i === rowCount - 1;
    return `
              <tr>
                <td style="padding:14px 16px;${isLast ? "" : " border-bottom:1px solid #F1F5F9;"}">
                  ${row}
                </td>
              </tr>`;
  }).join("");

  return `
        <tr>
          <td style="padding:16px 28px 8px 28px;">
            <div style="display:inline-block; font-size:10px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:${opts.labelColor};">${htmlEscape(opts.label)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 16px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #E2E8F0; border-radius:10px;">${stitched}
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
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${name}</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">${locPart}${before} → ${after} shipments · <span style="color:${pctColor}; font-weight:bold;">${pctStr}</span>${sevTag}</div>
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
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${name}</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">${locPart}<strong style="color:#0F172A;">${newCount}</strong> new shipments in the past 14 days${sevTag}</div>
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
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${name}</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">${prefix}<strong style="color:#0F172A;">${origin} → ${dest}</strong> · ${newCount} new shipments${sevTag}</div>
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
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${name}</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">${locPart}Baseline shift · ${before} → ${after} shipments · <span style="color:#0F172A; font-weight:bold;">${pctStr}</span>${sevTag}</div>
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
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">${before} → ${after} ${unit} · <span style="color:${pctColor}; font-weight:bold;">${pctStr}</span> WoW</div>
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
