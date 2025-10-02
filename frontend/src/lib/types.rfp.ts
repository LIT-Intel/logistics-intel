export type CompanyKpis = {
  companyId: string;
  companyName: string;
  shipments12m: number;
  lastActivity?: string;
  originsTop: string[];
  destsTop: string[];
  carriersTop: string[];
  estSpendBaseline?: number;
};

export type LanesAgg = {
  origin_country: string;
  dest_country: string;
  shipments: number;
  value_usd?: number;
  weight_kg?: number;
  carrier?: string;
};

export type RfpRecord = {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  dueDate?: string;
  status: 'Draft'|'Active'|'Outreach'|'Submitted'|'Won'|'Lost';
  owner: string;
  createdAt: string;
  updatedAt: string;
  payload: any;
};

export type FinancialModel = {
  baseline: number;
  proposed: number;
  savings: number;
  pct: number;
  assumptionsNote?: string;
};

