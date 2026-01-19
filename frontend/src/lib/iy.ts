import { getGatewayBase } from "./env";

type Json = Record<string, any>;

function q(obj: Record<string, string | number | undefined>) {
  const u = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null) u.set(k, String(v));
  });
  return u.toString();
}

async function getJson(path: string): Promise<{ ok: boolean; status: number; data?: Json; text?: string; }> {
  const base = getGatewayBase();
  const url = `${base}${path}`;
  const r = await fetch(url, { method: "GET" });
  const ct = r.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await r.json() : await r.text();
  return r.ok ? { ok: true, status: r.status, data: body } : { ok: false, status: r.status, data: ct.includes("json") ? body : undefined, text: !ct.includes("json") ? String(body) : undefined };
}

// DEPRECATED: Direct ImportYeti search - use Supabase lit_company_index instead
export async function iySearchShippers(qstr: string, page = 1) {
  return getJson(`/public/iy/searchShippers?${q({ q: qstr, page })}`);
}

// DEPRECATED: BOL endpoint - use snapshot API instead
export async function iyCompanyBols(company_id: string, page = 1) {
  return getJson(`/public/iy/companyBols?${q({ company_id, page })}`);
}

// DEPRECATED: BOL lookup - use snapshot API instead
export async function iyBolLookup(number: string) {
  return getJson(`/public/iy/bol?${q({ number })}`);
}

// NEW: Snapshot API (1 credit max per company)
export async function iyGetSnapshot(company_id: string) {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const url = `${base}/functions/v1/importyeti-proxy`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({ company_id }),
  });

  const data = await r.json();
  return r.ok ? { ok: true, ...data } : { ok: false, error: data.error };
}
