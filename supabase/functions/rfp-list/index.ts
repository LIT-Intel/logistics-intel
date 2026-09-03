import { createLogger, requestId } from "../_shared/logger.ts";
import { handlePreflight, json, requireUser, resolveUserOrg } from "../_shared/auth.ts";
import { RFP_STATUSES } from "../_shared/rfp_helpers.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("rfp-list", { request_id: requestId() });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { orgId } = await resolveUserOrg(auth.admin, auth.user.id);
  if (!orgId) return json({ ok: false, code: "NO_ORG", error: "No active workspace" }, 403);
  const body = await req.json().catch(() => ({}));

  let query = auth.admin
    .from("lit_rfps")
    .select("id,rfp_number,title,status,company_id,owner_user_id,due_date,estimated_annual_value,primary_mode,lane_count,created_at,updated_at")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (RFP_STATUSES.includes(body.status)) query = query.eq("status", body.status);
  if (body.company_id) query = query.eq("company_id", body.company_id);

  const { data, error } = await query;
  if (error) {
    log.error("list_failed", { err: error.message, user_id: auth.user.id, org_id: orgId });
    return json({ ok: false, code: "LIST_FAILED", error: "Unable to load RFPs" }, 500);
  }

  const companyIds = [...new Set((data ?? []).map((row) => row.company_id).filter(Boolean))];
  const rfpIds = (data ?? []).map((row) => row.id);
  const [{ data: companies }, { data: quotes }] = await Promise.all([
    companyIds.length
      ? auth.admin.from("lit_companies").select("id,name,domain,logo_url").in("id", companyIds)
      : Promise.resolve({ data: [] }),
    rfpIds.length
      ? auth.admin.from("lit_quotes").select("id,rfp_id,status,total_sell,revision_no").in("rfp_id", rfpIds)
      : Promise.resolve({ data: [] }),
  ]);
  const companyById = Object.fromEntries((companies ?? []).map((company) => [company.id, company]));
  const quoteByRfp = new Map<string, { count: number; latest_status: string | null; latest_revision: number }>();
  for (const quote of quotes ?? []) {
    const current = quoteByRfp.get(quote.rfp_id) ?? { count: 0, latest_status: null, latest_revision: 0 };
    current.count += 1;
    if (Number(quote.revision_no) >= current.latest_revision) {
      current.latest_revision = Number(quote.revision_no) || 1;
      current.latest_status = quote.status;
    }
    quoteByRfp.set(quote.rfp_id, current);
  }

  const items = (data ?? []).map((row) => ({
    ...row,
    estimated_annual_value: Number(row.estimated_annual_value ?? 0),
    company: companyById[row.company_id] ?? null,
    quotes: quoteByRfp.get(row.id) ?? { count: 0, latest_status: null, latest_revision: 0 },
  }));
  const metrics = items.reduce(
    (acc, item) => {
      acc.count += 1;
      acc.value += item.estimated_annual_value;
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    { count: 0, value: 0 } as Record<string, number>,
  );
  return json({ ok: true, items, metrics });
});
