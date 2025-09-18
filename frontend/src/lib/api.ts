const BASE = (() => {
  const defaultGateway = "https://lit-caller-gw-2e68g4k3.uc.gateway.dev/public";
  const base = (import.meta.env as any).VITE_API_BASE || (import.meta.env as any).VITE_PROXY_BASE || defaultGateway;
  if (base.endsWith("/public")) return base;
  if (base.endsWith("/public/")) return base.slice(0, -1);
  if (base === "/api/public") return base;
  return base.replace(/\/$/, "") + "/public";
})();

export async function getFilterOptions(input: object = {}, signal?: AbortSignal) {
  const res = await fetch(`${BASE}/getFilterOptions`, {
    method: "GET",
    headers: { "content-type": "application/json", "accept": "application/json" },
    signal,
  });
  if (res.status === 422) {
    const err = await res.json().catch(() => ({ message: "Validation error" }));
    console.error("getFilterOptions validation error", err?.fieldErrors || err);
    throw new Error("Invalid filters request. Please adjust and retry.");
  }
  if (!res.ok) throw new Error(`getFilterOptions ${res.status}`);
  return res.json();
}

export type SearchCompaniesInput = { q?: string; mode?: "all"|"ocean"|"air"; filters?: Record<string, any>; dateRange?: { from?: string; to?: string }; pagination?: { limit?: number; offset?: number } };

export async function searchCompanies(body: SearchCompaniesInput, signal?: AbortSignal) {
  const normalized = {
    q: body.q ?? "",
    mode: body.mode ?? "all",
    filters: body.filters ?? {},
    dateRange: {
      from: body.dateRange?.from ?? undefined,
      to: body.dateRange?.to ?? undefined,
    },
    pagination: {
      limit: body.pagination?.limit ?? 10,
      offset: body.pagination?.offset ?? 0,
    },
  } as const;
  const res = await fetch(`${BASE}/searchCompanies`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify(normalized),
    signal,
  });
  if (res.status === 422 || res.status === 400) {
    const err = await res.json().catch(() => ({ message: "Validation error" }));
    console.error("searchCompanies validation error", err);
    throw new Error(err?.message || "Invalid search parameters");
  }
  if (!res.ok) throw new Error(`searchCompanies ${res.status}`);
  return res.json();
}

