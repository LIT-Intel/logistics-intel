/**
 * Company-scoped CRM/revenue reads for the Company Profile "360 hub".
 *
 * This module is intentionally READ-ONLY and company-scoped. It answers the
 * question "what is this one company's lifecycle state?" across the deal,
 * quote, campaign, task, and email surfaces so the profile can render a
 * compact CRM / Revenue summary panel that ties search → research → enrich
 * → email/campaign → quote → deal → won together.
 *
 * Per CLAUDE.md + task scope: new company-scoped queries live here, NOT in
 * crm.ts / crmReports.ts (which stay untouched — this module imports their
 * public types only). Everything is org-scoped via RLS on the underlying
 * tables (lit_deals / lit_quotes / lit_campaign_contacts / lit_tasks /
 * lit_email_threads all carry org_id + RLS policies), so the user-scoped
 * supabase client here can only ever see the caller's workspace rows.
 *
 * Identity model (important): a company on the profile page can be addressed
 * three ways and different tables key off different ones:
 *   - lit_companies.id (UUID)            → lit_quotes.company_id,
 *                                           lit_campaign_contacts.company_id,
 *                                           lit_email_threads.company_id
 *   - lit_saved_companies.id (UUID)      → lit_deals.saved_company_id,
 *                                           lit_tasks.saved_company_id
 *   - source_company_key / UUID (text)   → lit_deals.company_id (text col;
 *                                           written from CreateDealModal's
 *                                           companyKey which is
 *                                           source_company_key ?? companyId)
 *
 * Callers pass whatever identity they hold; each query below defends against
 * the missing pieces (e.g. resolves saved_company_id from the UUID when the
 * caller only has the lit_companies UUID).
 */

import { supabase } from "@/lib/supabase";
import type { DealCard, DealStage } from "@/api/crm";
import { loadMemberNames } from "@/api/crm";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CompanyIdentity = {
  /** lit_companies.id — the canonical company UUID. */
  companyUuid?: string | null;
  /** lit_saved_companies.id — the saved-company row UUID (deals/tasks key). */
  savedCompanyId?: string | null;
  /** source_company_key (e.g. "company/acme") — the slug key. */
  sourceCompanyKey?: string | null;
  /** Display name (for prefilling deal titles etc.). */
  companyName?: string | null;
  /** Display domain (avatar / links). */
  companyDomain?: string | null;
};

/**
 * Resolve the saved-company row id for this company (deals/tasks key). The
 * profile usually only holds the lit_companies UUID; deals + tasks key off
 * lit_saved_companies.id. Returns null when the company isn't saved by anyone
 * in the workspace (RLS-scoped).
 */
export async function resolveSavedCompanyId(
  ident: CompanyIdentity,
): Promise<string | null> {
  if (ident.savedCompanyId && UUID_RE.test(ident.savedCompanyId)) {
    return ident.savedCompanyId;
  }
  const companyUuid = ident.companyUuid;
  if (!companyUuid || !UUID_RE.test(companyUuid)) return null;
  try {
    const { data } = await supabase
      .from("lit_saved_companies")
      .select("id")
      .eq("company_id", companyUuid)
      .limit(1)
      .maybeSingle();
    return (data as any)?.id ?? null;
  } catch {
    return null;
  }
}

// ── Deals ──────────────────────────────────────────────────────────────
/**
 * All deals for this company, enriched (owner name + open-task count) so the
 * panel can render clickable rows that open the DealDetailDrawer. Matches on
 * BOTH keys because CreateDealModal writes lit_deals.saved_company_id (uuid)
 * OR lit_deals.company_id (text) depending on which identity the caller held
 * at create time.
 */
export async function listCompanyDeals(
  ident: CompanyIdentity,
): Promise<DealCard[]> {
  const savedCompanyId = await resolveSavedCompanyId(ident);

  // Candidate text values that lit_deals.company_id could hold. The modal
  // passes `source_company_key ?? companyId`, and companyId is sometimes the
  // lit_companies UUID and sometimes the slug — so include every shape.
  const textKeys = Array.from(
    new Set(
      [
        ident.companyUuid,
        ident.sourceCompanyKey,
        ident.sourceCompanyKey
          ? String(ident.sourceCompanyKey).replace(/^company\//i, "")
          : null,
        ident.sourceCompanyKey
          ? null
          : ident.companyUuid
            ? `company/${ident.companyUuid}`
            : null,
      ].filter((v): v is string => !!v),
    ),
  );

  if (!savedCompanyId && textKeys.length === 0) return [];

  // Build an OR filter across saved_company_id + company_id(text).
  const orParts: string[] = [];
  if (savedCompanyId) orParts.push(`saved_company_id.eq.${savedCompanyId}`);
  for (const k of textKeys) orParts.push(`company_id.eq.${k}`);

  const { data: deals, error } = await supabase
    .from("lit_deals")
    .select("*")
    .or(orParts.join(","))
    .order("updated_at", { ascending: false });
  if (error || !deals?.length) return [];

  const ownerIds = (deals as any[]).map((d) => d.owner_user_id).filter(Boolean);
  const dealIds = (deals as any[]).map((d) => d.id);

  const [ownerNames, taskAgg] = await Promise.all([
    loadMemberNames(ownerIds),
    (async () => {
      const map: Record<string, { due: string | null; count: number }> = {};
      if (!dealIds.length) return map;
      const { data } = await supabase
        .from("lit_tasks")
        .select("deal_id, due_date")
        .in("deal_id", dealIds)
        .eq("status", "open");
      for (const t of (data as any[]) ?? []) {
        if (!t.deal_id) continue;
        const cur = map[t.deal_id] ?? { due: null, count: 0 };
        cur.count += 1;
        if (t.due_date && (!cur.due || t.due_date < cur.due)) cur.due = t.due_date;
        map[t.deal_id] = cur;
      }
      return map;
    })(),
  ]);

  return (deals as any[]).map((d) => {
    const tasks = taskAgg[d.id];
    return {
      ...d,
      companyName: ident.companyName ?? null,
      companyDomain: ident.companyDomain ?? null,
      companyKey: ident.sourceCompanyKey ?? d.company_id ?? null,
      contactName: null,
      ownerName: ownerNames[d.owner_user_id] ?? null,
      nextTaskDue: tasks?.due ?? null,
      openTaskCount: tasks?.count ?? 0,
    } as DealCard;
  });
}

// ── Quotes ─────────────────────────────────────────────────────────────
export type CompanyQuoteSummary = {
  count: number;
  latest: {
    id: string;
    quote_number: string | null;
    status: string | null;
    total_sell: number | null;
    updated_at: string | null;
    share_token: string | null;
  } | null;
  wonValue: number;
  openValue: number;
};

/**
 * Quote rollup for this company. lit_quotes.company_id is the lit_companies
 * UUID. Returns a count + latest quote (for a deep link) + won/open value
 * sums for the panel. Honest zeros — no fabrication.
 */
export async function getCompanyQuoteSummary(
  ident: CompanyIdentity,
): Promise<CompanyQuoteSummary> {
  const empty: CompanyQuoteSummary = {
    count: 0,
    latest: null,
    wonValue: 0,
    openValue: 0,
  };
  const companyUuid = ident.companyUuid;
  if (!companyUuid || !UUID_RE.test(companyUuid)) return empty;
  const { data, error } = await supabase
    .from("lit_quotes")
    .select("id, quote_number, status, total_sell, updated_at, share_token")
    .eq("company_id", companyUuid)
    .order("updated_at", { ascending: false });
  if (error || !data?.length) return empty;

  let wonValue = 0;
  let openValue = 0;
  for (const q of data as any[]) {
    const sell = Number(q.total_sell) || 0;
    if (q.status === "closed_won") wonValue += sell;
    else if (q.status !== "closed_lost") openValue += sell;
  }
  return {
    count: data.length,
    latest: (data[0] as any) ?? null,
    wonValue,
    openValue,
  };
}

// ── Campaigns ──────────────────────────────────────────────────────────
export type CompanyCampaignSummary = {
  campaignCount: number;
  contactCount: number;
  campaigns: Array<{ id: string; name: string | null; status: string | null }>;
};

/**
 * Campaign membership for this company. lit_campaign_contacts.company_id is
 * the lit_companies UUID. We surface the DISTINCT campaigns this company's
 * contacts belong to (with names/status via a lit_campaigns join) plus a raw
 * contact-membership count.
 */
export async function getCompanyCampaignSummary(
  ident: CompanyIdentity,
): Promise<CompanyCampaignSummary> {
  const empty: CompanyCampaignSummary = {
    campaignCount: 0,
    contactCount: 0,
    campaigns: [],
  };
  const companyUuid = ident.companyUuid;
  if (!companyUuid || !UUID_RE.test(companyUuid)) return empty;
  const { data, error } = await supabase
    .from("lit_campaign_contacts")
    .select("campaign_id, lit_campaigns(id, name, status)")
    .eq("company_id", companyUuid);
  if (error || !data?.length) return empty;

  const byCampaign = new Map<
    string,
    { id: string; name: string | null; status: string | null }
  >();
  for (const row of data as any[]) {
    const c = row.lit_campaigns;
    if (c?.id && !byCampaign.has(c.id)) {
      byCampaign.set(c.id, {
        id: c.id,
        name: c.name ?? null,
        status: c.status ?? null,
      });
    }
  }
  return {
    campaignCount: byCampaign.size,
    contactCount: data.length,
    campaigns: Array.from(byCampaign.values()),
  };
}

// ── Tasks ──────────────────────────────────────────────────────────────
export type CompanyTaskSummary = {
  openCount: number;
  nextDue: string | null;
};

/**
 * Open-task rollup for this company (lit_tasks.saved_company_id). Requires the
 * saved-company id, which we resolve from the lit_companies UUID when needed.
 */
export async function getCompanyTaskSummary(
  ident: CompanyIdentity,
): Promise<CompanyTaskSummary> {
  const savedCompanyId = await resolveSavedCompanyId(ident);
  if (!savedCompanyId) return { openCount: 0, nextDue: null };
  const { data, error } = await supabase
    .from("lit_tasks")
    .select("due_date")
    .eq("saved_company_id", savedCompanyId)
    .eq("status", "open");
  if (error || !data?.length) return { openCount: 0, nextDue: null };
  let nextDue: string | null = null;
  for (const t of data as any[]) {
    if (t.due_date && (!nextDue || t.due_date < nextDue)) nextDue = t.due_date;
  }
  return { openCount: data.length, nextDue };
}

// ── Email / conversations ──────────────────────────────────────────────
export type CompanyEmailSummary = {
  threadCount: number;
  unreadCount: number;
  lastMessageAt: string | null;
  lastSubject: string | null;
};

/**
 * Email-thread rollup for this company (lit_email_threads.company_id = the
 * lit_companies UUID). Feeds a count/last-thread summary that links into the
 * profile's Inbox tab so email is visibly part of the record.
 */
export async function getCompanyEmailSummary(
  ident: CompanyIdentity,
): Promise<CompanyEmailSummary> {
  const empty: CompanyEmailSummary = {
    threadCount: 0,
    unreadCount: 0,
    lastMessageAt: null,
    lastSubject: null,
  };
  const companyUuid = ident.companyUuid;
  if (!companyUuid || !UUID_RE.test(companyUuid)) return empty;
  const { data, error } = await supabase
    .from("lit_email_threads")
    .select("subject, last_message_at, unread_count")
    .eq("company_id", companyUuid)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error || !data?.length) return empty;
  let unread = 0;
  for (const t of data as any[]) unread += Number(t.unread_count) || 0;
  return {
    threadCount: data.length,
    unreadCount: unread,
    lastMessageAt: (data[0] as any)?.last_message_at ?? null,
    lastSubject: (data[0] as any)?.subject ?? null,
  };
}

// ── Combined loader ────────────────────────────────────────────────────
export type CompanyCrmSummary = {
  deals: DealCard[];
  quotes: CompanyQuoteSummary;
  campaigns: CompanyCampaignSummary;
  tasks: CompanyTaskSummary;
  email: CompanyEmailSummary;
};

/**
 * One-shot loader for the profile's CRM / Revenue panel. Runs every
 * company-scoped read in parallel and returns a single object. All sub-reads
 * fail soft (return empties) so a single provider hiccup never blanks the
 * whole panel.
 */
export async function loadCompanyCrmSummary(
  ident: CompanyIdentity,
): Promise<CompanyCrmSummary> {
  const [deals, quotes, campaigns, tasks, email] = await Promise.all([
    listCompanyDeals(ident).catch(() => [] as DealCard[]),
    getCompanyQuoteSummary(ident).catch(() => ({
      count: 0,
      latest: null,
      wonValue: 0,
      openValue: 0,
    })),
    getCompanyCampaignSummary(ident).catch(() => ({
      campaignCount: 0,
      contactCount: 0,
      campaigns: [],
    })),
    getCompanyTaskSummary(ident).catch(() => ({ openCount: 0, nextDue: null })),
    getCompanyEmailSummary(ident).catch(() => ({
      threadCount: 0,
      unreadCount: 0,
      lastMessageAt: null,
      lastSubject: null,
    })),
  ]);
  return { deals, quotes, campaigns, tasks, email };
}

export type { DealCard, DealStage };
