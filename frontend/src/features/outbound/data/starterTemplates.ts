// Six branded starter templates for the email composer's gallery.
//
// All templates share one layout helper that builds an email-safe
// table-based scaffold with inline styles. Each template differs only
// in the hero SVG (mirrors the /l/<sector> illustrations as a static,
// animation-free version Outlook + Gmail render the same way), the
// body copy (already passed through copywriting → ogilvy → stop-slop
// → page-cro pipelines), and the CTA.
//
// Subject lines use the 8-12 word range Ogilvy found best for response,
// front-loading the benefit and the prospect's identity.

import type { Sector } from "@/pages/landing/sectors";

type HeroKind = "stack" | "broker" | "customs" | "nvocc" | "dashboard" | "newsletter" | "team";

export interface StarterTemplate {
  key: string;
  name: string;
  description: string;
  sector: Sector["id"] | "general";
  hero: HeroKind;
  accent: string;
  subject: string;
  body_html: string;
}

const ACCENT = {
  ocean: "#0EA5E9",
  blue: "#3B82F6",
  purple: "#7C3AED",
  teal: "#0F766E",
  red: "#DC2626",
  amber: "#F59E0B",
  slate: "#475569",
};

// ────────────────────────────────────────────────────────────────────
// Hero SVG renderers
// ────────────────────────────────────────────────────────────────────

function heroStack(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220" width="600" height="220" role="img" aria-label="Container stack">
<defs><linearGradient id="bgs" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#E0F2FE"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient></defs>
<rect x="0" y="0" width="600" height="220" rx="14" fill="url(#bgs)"/>
<rect x="60" y="186" width="480" height="6" rx="3" fill="#0F172A" opacity="0.16"/>
<g>
  <rect x="80" y="142" width="72" height="42" rx="3" fill="#0F172A"/>
  <rect x="160" y="142" width="72" height="42" rx="3" fill="${accent}"/>
  <rect x="240" y="142" width="72" height="42" rx="3" fill="#64748B"/>
  <rect x="320" y="142" width="72" height="42" rx="3" fill="${accent}"/>
  <rect x="400" y="142" width="72" height="42" rx="3" fill="#0F172A"/>
  <rect x="120" y="92" width="72" height="42" rx="3" fill="${accent}" opacity="0.92"/>
  <rect x="200" y="92" width="72" height="42" rx="3" fill="${accent}" opacity="0.92"/>
  <rect x="280" y="92" width="72" height="42" rx="3" fill="#0F172A" opacity="0.92"/>
  <rect x="360" y="92" width="72" height="42" rx="3" fill="${accent}" opacity="0.92"/>
  <rect x="240" y="42" width="72" height="42" rx="3" fill="${accent}"/>
  <line x1="276" y1="14" x2="276" y2="42" stroke="#0F172A" stroke-width="3"/>
  <line x1="262" y1="14" x2="290" y2="14" stroke="#0F172A" stroke-width="3"/>
</g>
<text x="510" y="40" fill="#0F172A" font-family="Georgia,serif" font-size="14" font-weight="700">LIT</text>
<text x="510" y="58" fill="#64748B" font-family="Georgia,serif" font-size="10">Trade Intel</text>
</svg>`;
}

function heroBroker(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220" width="600" height="220" role="img" aria-label="Broker network">
<defs><linearGradient id="bgb" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#DBEAFE"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient></defs>
<rect x="0" y="0" width="600" height="220" rx="14" fill="url(#bgb)"/>
<line x1="120" y1="60" x2="300" y2="110" stroke="${accent}" stroke-width="2" stroke-dasharray="6 4"/>
<line x1="120" y1="160" x2="300" y2="110" stroke="${accent}" stroke-width="2" stroke-dasharray="6 4"/>
<line x1="480" y1="60" x2="300" y2="110" stroke="${accent}" stroke-width="2" stroke-dasharray="6 4"/>
<line x1="480" y1="160" x2="300" y2="110" stroke="${accent}" stroke-width="2" stroke-dasharray="6 4"/>
<circle cx="300" cy="110" r="40" fill="${accent}"/>
<text x="300" y="116" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-weight="700" font-size="13">YOU</text>
<g font-family="Georgia,serif" font-weight="700" font-size="13">
<circle cx="120" cy="60" r="22" fill="#fff" stroke="#0F172A" stroke-width="1.5"/><text x="120" y="65" text-anchor="middle" fill="#0F172A">S</text>
<circle cx="120" cy="160" r="22" fill="#fff" stroke="#0F172A" stroke-width="1.5"/><text x="120" y="165" text-anchor="middle" fill="#0F172A">S</text>
<circle cx="480" cy="60" r="22" fill="#fff" stroke="#0F172A" stroke-width="1.5"/><text x="480" y="65" text-anchor="middle" fill="#0F172A">C</text>
<circle cx="480" cy="160" r="22" fill="#fff" stroke="#0F172A" stroke-width="1.5"/><text x="480" y="165" text-anchor="middle" fill="#0F172A">C</text>
</g>
</svg>`;
}

function heroCustoms(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220" width="600" height="220" role="img" aria-label="Customs clearance">
<defs><linearGradient id="bgc" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#EDE9FE"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient>
<marker id="arr" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${accent}"/></marker></defs>
<rect x="0" y="0" width="600" height="220" rx="14" fill="url(#bgc)"/>
<rect x="80" y="50" width="120" height="120" rx="6" fill="#fff" stroke="#0F172A" stroke-width="1.5"/>
<line x1="96" y1="74" x2="186" y2="74" stroke="#CBD5E1" stroke-width="2"/>
<line x1="96" y1="94" x2="186" y2="94" stroke="#CBD5E1" stroke-width="2"/>
<line x1="96" y1="114" x2="186" y2="114" stroke="#CBD5E1" stroke-width="2"/>
<line x1="96" y1="134" x2="186" y2="134" stroke="#CBD5E1" stroke-width="2"/>
<path d="M 220 110 L 290 110" stroke="${accent}" stroke-width="3" marker-end="url(#arr)" fill="none"/>
<g transform="translate(380,110) rotate(-15) translate(-380,-110)">
  <circle cx="380" cy="110" r="50" fill="none" stroke="${accent}" stroke-width="3"/>
  <circle cx="380" cy="110" r="40" fill="none" stroke="${accent}" stroke-width="1.5" stroke-dasharray="3 2"/>
  <text x="380" y="106" text-anchor="middle" fill="${accent}" font-family="Georgia,serif" font-weight="800" font-size="13">CLEARED</text>
  <text x="380" y="122" text-anchor="middle" fill="${accent}" font-family="Georgia,serif" font-size="10">HS · ORIGIN</text>
</g>
<path d="M 470 175 l 12 12 l 24 -24" stroke="#16A34A" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function heroNvocc(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220" width="600" height="220" role="img" aria-label="NVOCC pipeline">
<defs><linearGradient id="bgn" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#CCFBF1"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient></defs>
<rect x="0" y="0" width="600" height="220" rx="14" fill="url(#bgn)"/>
<rect x="0" y="160" width="600" height="50" fill="${accent}" opacity="0.18"/>
<g>
  <rect x="60" y="130" width="100" height="22" rx="3" fill="#0F172A"/>
  <rect x="80" y="108" width="18" height="22" fill="${accent}"/>
  <rect x="102" y="102" width="18" height="28" fill="${accent}"/>
  <rect x="124" y="112" width="18" height="18" fill="${accent}"/>
  <polygon points="60,152 50,162 170,162 160,152" fill="#0F172A"/>
</g>
<line x1="180" y1="138" x2="240" y2="138" stroke="${accent}" stroke-width="3"/>
<g>
  <line x1="280" y1="80" x2="280" y2="160" stroke="#0F172A" stroke-width="3"/>
  <line x1="280" y1="80" x2="320" y2="80" stroke="#0F172A" stroke-width="3"/>
  <line x1="320" y1="80" x2="320" y2="100" stroke="#0F172A" stroke-width="2"/>
  <rect x="305" y="100" width="30" height="18" fill="${accent}"/>
</g>
<line x1="350" y1="138" x2="410" y2="138" stroke="${accent}" stroke-width="3"/>
<g>
  <rect x="430" y="120" width="60" height="34" rx="3" fill="#0F172A"/>
  <rect x="430" y="106" width="26" height="18" fill="${accent}"/>
  <circle cx="442" cy="160" r="7" fill="#0F172A"/>
  <circle cx="478" cy="160" r="7" fill="#0F172A"/>
</g>
</svg>`;
}

function heroDashboard(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220" width="600" height="220" role="img" aria-label="Analytics dashboard">
<defs><linearGradient id="bgd" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#FEE2E2"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient></defs>
<rect x="0" y="0" width="600" height="220" rx="14" fill="url(#bgd)"/>
<rect x="60" y="30" width="480" height="160" rx="10" fill="#fff" stroke="#0F172A" stroke-width="1.5"/>
<line x1="80" y1="160" x2="520" y2="160" stroke="#CBD5E1" stroke-width="1.5"/>
<rect x="100" y="120" width="40" height="40" rx="3" fill="#0F172A" opacity="0.85"/>
<rect x="160" y="92" width="40" height="68" rx="3" fill="#0F172A" opacity="0.85"/>
<rect x="220" y="106" width="40" height="54" rx="3" fill="#0F172A" opacity="0.85"/>
<rect x="280" y="68" width="40" height="92" rx="3" fill="#0F172A" opacity="0.85"/>
<rect x="340" y="84" width="40" height="76" rx="3" fill="#0F172A" opacity="0.85"/>
<rect x="400" y="50" width="40" height="110" rx="3" fill="${accent}"/>
<rect x="460" y="58" width="40" height="102" rx="3" fill="#0F172A" opacity="0.85"/>
<path d="M 120 120 Q 180 100 240 110 T 420 50" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
<circle cx="420" cy="50" r="6" fill="${accent}"/>
</svg>`;
}

function heroNewsletter(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220" width="600" height="220" role="img" aria-label="Newsletter">
<defs><linearGradient id="bgnl" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#FEF3C7"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient></defs>
<rect x="0" y="0" width="600" height="220" rx="14" fill="url(#bgnl)"/>
<rect x="100" y="40" width="280" height="140" rx="6" fill="#fff" stroke="#0F172A" stroke-width="1.5"/>
<rect x="120" y="60" width="160" height="14" rx="2" fill="#0F172A"/>
<rect x="120" y="84" width="240" height="6" rx="2" fill="#94A3B8"/>
<rect x="120" y="98" width="220" height="6" rx="2" fill="#94A3B8"/>
<rect x="120" y="112" width="200" height="6" rx="2" fill="#94A3B8"/>
<rect x="120" y="126" width="240" height="6" rx="2" fill="#94A3B8"/>
<rect x="120" y="148" width="80" height="22" rx="3" fill="${accent}"/>
<text x="160" y="164" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-weight="700" font-size="11">READ</text>
<rect x="420" y="60" width="120" height="120" rx="6" fill="${accent}" opacity="0.18"/>
<circle cx="480" cy="120" r="44" fill="${accent}"/>
<text x="480" y="125" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-weight="700" font-size="14">+12%</text>
</svg>`;
}

function heroTeam(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220" width="600" height="220" role="img" aria-label="Sales team">
<defs><linearGradient id="bgt" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#E0E7FF"/><stop offset="100%" stop-color="#FFFFFF"/></linearGradient></defs>
<rect x="0" y="0" width="600" height="220" rx="14" fill="url(#bgt)"/>
<g>
  <circle cx="180" cy="110" r="36" fill="${accent}"/>
  <text x="180" y="115" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-weight="700" font-size="14">SDR</text>
  <circle cx="300" cy="110" r="36" fill="#0F172A"/>
  <text x="300" y="115" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-weight="700" font-size="14">AE</text>
  <circle cx="420" cy="110" r="36" fill="${accent}"/>
  <text x="420" y="115" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-weight="700" font-size="14">CSM</text>
</g>
<line x1="216" y1="110" x2="264" y2="110" stroke="#0F172A" stroke-width="2"/>
<line x1="336" y1="110" x2="384" y2="110" stroke="#0F172A" stroke-width="2"/>
</svg>`;
}

const HEROES: Record<HeroKind, (accent: string) => string> = {
  stack: heroStack,
  broker: heroBroker,
  customs: heroCustoms,
  nvocc: heroNvocc,
  dashboard: heroDashboard,
  newsletter: heroNewsletter,
  team: heroTeam,
};

// ────────────────────────────────────────────────────────────────────
// Layout helper
// ────────────────────────────────────────────────────────────────────

function layout(opts: {
  hero: HeroKind;
  accent: string;
  preheader: string;
  body: string;
  ctaText: string;
}): string {
  const heroSvg = HEROES[opts.hero](opts.accent);
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F8FAFC" style="background:#F8FAFC;font-family:Georgia,'Times New Roman',serif;">
  <tr><td align="center" style="padding:24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
      <tr><td style="padding:0;line-height:0;">${heroSvg}</td></tr>
      <tr><td style="padding:28px 32px 8px 32px;color:#0F172A;font-size:18px;line-height:1.55;">
        <div style="display:none;font-size:0;color:#FFFFFF;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(opts.preheader)}</div>
        ${opts.body}
      </td></tr>
      <tr><td style="padding:8px 32px 32px 32px;">
        <a href="https://logisticintel.com" style="display:inline-block;padding:12px 22px;background:${opts.accent};color:#FFFFFF;font-family:Georgia,serif;font-weight:700;font-size:15px;text-decoration:none;border-radius:8px;">${escapeHtml(opts.ctaText)}</a>
      </td></tr>
      <tr><td style="padding:18px 32px;border-top:1px solid #E2E8F0;color:#64748B;font-family:Georgia,serif;font-size:12px;line-height:1.5;">
        — {{sender_name}}, {{sender_company}}<br/>
        Reply to this email or book time at <a href="https://logisticintel.com" style="color:${opts.accent};">logisticintel.com</a>.
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ────────────────────────────────────────────────────────────────────
// The six templates
// ────────────────────────────────────────────────────────────────────

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: "nvocc_intro_v2",
    name: "NVOCC introduction",
    description: "Cold-open for non-vessel operators. Leads with route data on the prospect's actual lanes.",
    sector: "nvocc",
    hero: "nvocc",
    accent: ACCENT.teal,
    subject: "{{first_name}} — {{company_name}}'s Q1 lanes vs the {{company_name}}-route benchmark",
    body_html: layout({
      hero: "nvocc",
      accent: ACCENT.teal,
      preheader: "We pulled {{company_name}}'s last 90 days of bills of lading and benchmarked them.",
      ctaText: "See {{company_name}}'s lane benchmark",
      body: `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">We pulled {{company_name}}'s last 90 days of bills of lading and benchmarked your top trade lanes against the carriers your competitors are booking on the same routes.</p>
<p style="margin:0 0 16px 0;">Two findings worth your time:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;">Three of your shippers are using a single carrier where pooling would lift TEU per voyage by 14&ndash;22%.</li>
<li style="margin-bottom:8px;">Your fastest-growing lane has eight ineligible decision-makers we can put in front of your sales team this week.</li>
</ul>
<p style="margin:0 0 16px 0;">The benchmark report is yours — no signup, no demo, no pitch. Reply with "send it" and I'll forward the PDF.</p>`,
    }),
  },
  {
    key: "forwarder_sea_intro_v2",
    name: "Ocean forwarder intro",
    description: "For sea-freight forwarders. Anchors on shipper acquisition, not service description.",
    sector: "forwarder",
    hero: "stack",
    accent: ACCENT.ocean,
    subject: "{{company_name}} — 47 importers shipping to your home port last quarter",
    body_html: layout({
      hero: "stack",
      accent: ACCENT.ocean,
      preheader: "47 importers shipped into your home port last quarter without an existing forwarder relationship.",
      ctaText: "Get the 47-importer list",
      body: `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">47 U.S. importers shipped through your home port in Q1 without an existing forwarder relationship visible in customs records. Twelve of them shipped at least four times. Three shipped weekly.</p>
<p style="margin:0 0 16px 0;">If your sales team's running cold on the same trade-show lists everyone else is buying, this is a tighter starting point — every name comes with shipment counts, container types, and the supplier on the other side of the lane.</p>
<p style="margin:0 0 16px 0;">Want the list? Reply "47" and I'll send the spreadsheet.</p>`,
    }),
  },
  {
    key: "customs_broker_intro_v2",
    name: "Customs broker intro",
    description: "For licensed customs brokers. Frames around HS code accuracy and ACE filing risk.",
    sector: "broker",
    hero: "customs",
    accent: ACCENT.purple,
    subject: "{{first_name}} — {{company_name}}'s clients filing HS codes that could cost them at audit",
    body_html: layout({
      hero: "customs",
      accent: ACCENT.purple,
      preheader: "Three {{company_name}} clients are filing HS codes that don't match their supplier descriptions.",
      ctaText: "Pull the HS-code audit",
      body: `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">We ran an HS-code consistency check across {{company_name}}'s last 200 entries. Three accounts are filing codes that don't match their supplier descriptions — the kind of thing CBP picks up on a focused audit.</p>
<p style="margin:0 0 16px 0;">Catching it now is a 10-minute conversation with the importer. Catching it after a CF-28 is six months and a CF-29 penalty.</p>
<p style="margin:0 0 16px 0;">I'll send you the three accounts and the specific lines if it's useful. Just reply "audit."</p>`,
    }),
  },
  {
    key: "forwarder_air_intro_v2",
    name: "Air forwarder intro",
    description: "For air-freight forwarders. Time-sensitive demand around capacity and recovery windows.",
    sector: "forwarder",
    hero: "broker",
    accent: ACCENT.blue,
    subject: "{{company_name}} — three air shippers losing capacity on your strongest lane",
    body_html: layout({
      hero: "broker",
      accent: ACCENT.blue,
      preheader: "Three importers on your strongest lane lost incumbent air capacity last week.",
      ctaText: "Show me the three accounts",
      body: `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Three importers shipping into your strongest North-American gateway just lost incumbent air capacity — the carrier they used twelve straight weeks dropped two of their bookings in the last seven days.</p>
<p style="margin:0 0 16px 0;">When freight forwarders win these accounts, they win them in the recovery window. Five days from now another forwarder picks up the call.</p>
<p style="margin:0 0 16px 0;">Reply "show me" and I'll send the three accounts plus the lane details.</p>`,
    }),
  },
  {
    key: "sales_team_intro_v2",
    name: "Sales team intro",
    description: "Generic introduction from the LIT team. Use when persona is unclear or testing.",
    sector: "general",
    hero: "team",
    accent: ACCENT.blue,
    subject: "{{first_name}} — a 90-second look at how {{company_name}} ships",
    body_html: layout({
      hero: "team",
      accent: ACCENT.blue,
      preheader: "A 90-second teardown of how {{company_name}} actually ships — no signup.",
      ctaText: "See {{company_name}}'s shipping profile",
      body: `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">Logistic Intel pulls live customs and bill-of-lading data and turns it into a shipper profile your sales team can act on — top lanes, container counts, supplier relationships, and the decision-makers behind them.</p>
<p style="margin:0 0 16px 0;">I built {{company_name}}'s profile this morning. It runs about 90 seconds to read.</p>
<p style="margin:0 0 16px 0;">Reply "send it" and I'll forward the PDF. No signup, no demo gate.</p>`,
    }),
  },
  {
    key: "newsletter_v2",
    name: "Monthly newsletter",
    description: "Branded monthly update. Opens with one chart, closes with one CTA.",
    sector: "general",
    hero: "newsletter",
    accent: ACCENT.amber,
    subject: "{{first_name}} — March in freight: imports up 12%, three lanes broke",
    body_html: layout({
      hero: "newsletter",
      accent: ACCENT.amber,
      preheader: "March imports rose 12% YoY. Three trade lanes shifted hard. Here's the read.",
      ctaText: "Read the full report",
      body: `<p style="margin:0 0 16px 0;">Hi {{first_name}},</p>
<p style="margin:0 0 16px 0;">March U.S. imports closed up 12% year over year. Three trade lanes moved hard enough to matter:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;">
  <li style="margin-bottom:8px;">Vietnam → Long Beach: <strong>+34% TEU</strong>, with apparel and home goods leading.</li>
<li style="margin-bottom:8px;">Mexico → Laredo: <strong>+19% truck volume</strong>, the strongest quarter on record.</li>
<li style="margin-bottom:8px;">China → Savannah: <strong>−8%</strong>, the first material drop since 2023.</li>
</ul>
<p style="margin:0 0 16px 0;">If you want the full read with the named importers driving each move, the report is below.</p>`,
    }),
  },
];

export function getStarterTemplate(key: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((t) => t.key === key) || null;
}
