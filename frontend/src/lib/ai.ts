export type PreCallInputs = {
  company: {
    id: string;
    name: string;
    shipments12m: number;
    lastActivity: string | null;
    originsTop: string[];
    destsTop: string[];
    carriersTop: string[];
  };
  shipments: Array<{
    mode?: string;
    origin_country?: string;
    dest_country?: string;
    carrier?: string | null;
    value_usd?: number | null;
    weight_kg?: number | null;
    date?: string | null;
  }>;
};

export function buildPreCallPrompt(d: PreCallInputs) {
  const s = (a?: any[]) => (Array.isArray(a) ? a.filter(Boolean).join(', ') : '');
  return `ROLE: Senior logistics analyst. OUTPUT: JSON with keys overview,strategy,competition,trade,risks,talkTracks (array of short bullets). Avoid hallucinations; use data provided. KPIs: shipments12m=${d.company.shipments12m}, lastActivity=${d.company.lastActivity}, originsTop=${s(d.company.originsTop)}, destsTop=${s(d.company.destsTop)}, carriersTop=${s(d.company.carriersTop)}. Recent shipments (max10): ${JSON.stringify(d.shipments.slice(0, 10))}. Focus on seasonality, lanes, carrier mix, HS themes (if inferable), and 3 opener bullets for a freight intro.`;
}

