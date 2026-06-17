// Bubble color palettes for the Pulse Explorer map. Three modes:
// Industry (categorical), Workflow (categorical), Opportunity (sequential).

export const INDUSTRY_PALETTE = {
  'Manufacturing': '#EF4444',
  'Retail': '#3B82F6',
  'Transportation': '#10B981',
  'Energy': '#F59E0B',
  'Technology': '#A855F7',
  'Food Manufacturing': '#F97316',
  'Wholesale': '#06B6D4',
  'Construction': '#84CC16',
  'Healthcare': '#EC4899',
  'Other': '#94A3B8',
};

export const WORKFLOW_PALETTE = {
  saved: '#06B6D4',
  in_campaign: '#A855F7',
  meeting_booked: '#10B981',
  unsaved: '#94A3B8',
};

export const OPPORTUNITY_STOPS = [
  { at: 0,   color: '#3B82F6' },
  { at: 25,  color: '#60A5FA' },
  { at: 50,  color: '#FBBF24' },
  { at: 75,  color: '#F59E0B' },
  { at: 100, color: '#DC2626' },
];

export function industryColor(industry) {
  return INDUSTRY_PALETTE[industry] ?? INDUSTRY_PALETTE.Other;
}

export function workflowColor(state) {
  return WORKFLOW_PALETTE[state] ?? WORKFLOW_PALETTE.unsaved;
}

export function opportunityColor(score) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  for (let i = 1; i < OPPORTUNITY_STOPS.length; i++) {
    const prev = OPPORTUNITY_STOPS[i - 1];
    const next = OPPORTUNITY_STOPS[i];
    if (s <= next.at) {
      const t = (s - prev.at) / (next.at - prev.at);
      return mixHex(prev.color, next.color, t);
    }
  }
  return OPPORTUNITY_STOPS[OPPORTUNITY_STOPS.length - 1].color;
}

function mixHex(a, b, t) {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}
