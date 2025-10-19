export type DashboardResponse={shipments_90d:number|null;teus_90d:number|null;growth_rate_90d:number|null;saved_companies_total:number|null;saved_companies_90d:number|null;enriched_contacts_total:number|null;active_campaigns:number|null;rfps_total:number|null;rfps_open:number|null;rfps_won:number|null;rfps_lost:number|null;avg_shipments_per_saved_company_90d:number|null};
export type RecentCompany={company_id:string;company_name:string;company_city?:string|null;company_state?:string|null;website?:string|null;shipments_12m?:number|null;teus_12m?:number|null;last_activity?:string|null;created_at?:string|null};
export type CompanyProfile={company_id:string;company_name:string;company_city?:string|null;company_state?:string|null;website?:string|null;shipments_12m:number|null;teus_12m:number|null;growth_90d:number|null;last_activity:string|null};
export type ShipmentRow={shipment_date:string;mode:string|null;origin_country?:string|null;origin_state?:string|null;origin_city?:string|null;dest_country?:string|null;dest_state?:string|null;dest_city?:string|null;origin_port?:string|null;dest_port?:string|null;hs_code?:string|null;carrier?:string|null;gross_weight_kg?:number|null;container_count?:number|null;teu?:number|null};

export async function getDashboard():Promise<DashboardResponse|null>{
  try{ const r=await fetch('/api/lit/public/getDashboard'); if(!r.ok) return null; const j=await r.json(); return (j.data??j) as DashboardResponse; }catch{ return null }
}
export async function getRecentlySavedCompanies(limit=10):Promise<RecentCompany[]>{
  try{ const r=await fetch(`/api/lit/public/getRecentlySavedCompanies?limit=${limit}`); if(!r.ok) return []; const j=await r.json(); return (j.rows??[]) as RecentCompany[] }catch{ return [] }
}
export async function getCompanyProfile(company_id:string):Promise<CompanyProfile|null>{
  try{ const r=await fetch(`/api/lit/public/getCompanyProfile?company_id=${encodeURIComponent(company_id)}`); if(!r.ok) return null; const j=await r.json(); return (j.data??j) as CompanyProfile; }catch{ return null }
}
export async function getCompanyShipments(params:{company_id:string;limit?:number;offset?:number;from?:string;to?:string;origin_country?:string;origin_state?:string;origin_city?:string;dest_country?:string;dest_state?:string;dest_city?:string;origin_port?:string;dest_port?:string;hs_code?:string;}):Promise<ShipmentRow[]>{
  const q=new URLSearchParams(params as any).toString();
  try{ const r=await fetch(`/api/lit/public/getCompanyShipments?${q}`); if(!r.ok) return []; const j=await r.json(); return (j.rows??[]) as ShipmentRow[] }catch{ return [] }
}
