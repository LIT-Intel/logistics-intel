import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart2,
  Briefcase,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Container,
  DollarSign,
  Globe,
  Hash,
  Loader2,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Ship,
  Target,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import LitPill from "@/components/ui/LitPill";
import { resolveEndpoint } from "@/lib/laneGlobe";
import { normalizeSupplier } from "@/lib/supplierNormalize";
import { supabase } from "@/lib/supabase";

/**
 * Phase 3 — Right-rail "Account Details" panel for the Company Profile.
 *
 * Four collapsible sections per design:
 *   - Account Details   (owner, last activity, CRM stage, imports-to,
 *                        coverage pills derived from real ImportYeti
 *                        flags when present)
 *   - Lists & Campaigns (real list/campaign membership; empty pills
 *                        when no membership)
 *   - Firmographics     (website, phone, HQ, industry, headcount,
 *                        revenue, founded — surfaced from `profile`
 *                        when ImportYeti / enrichment populates them)
 *   - Trade Intelligence(top lane, top carrier, top mode, last shipment,
 *                        volume signal — derived from headerKpis +
 *                        profile.recentBols)
 *
 * Every cell that has no real value renders `"—"` rather than a fabricated
 * placeholder. The footer "Refresh enrichment" button surfaces the same
 * `onRefresh` handler Company.jsx wires to `getSavedCompanyDetail`.
 */

type DetailsCompany = {
  domain?: string | null;
  website?: string | null;
  address?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  phone?: string | null;
};

type DetailsKpis = {
  shipments?: number | null;
  teu?: number | null;
  topRoute?: string | null;
  recentRoute?: string | null;
  lastShipment?: string | null;
};

type Profile = {
  industry?: string | null;
  employeeCount?: number | null;
  estimatedRevenue?: number | string | null;
  yearFounded?: number | string | null;
  topCarriers?: Array<{ name: string; count?: number }> | null;
  topForwarders?: Array<{ name: string; count?: number }> | null;
  forwarders?: Array<{ name: string; count?: number }> | null;
  serviceProviders?: Array<{ name: string; count?: number }> | null;
  topModes?: Array<{ mode: string; count?: number }> | null;
  recentBols?: any[] | null;
  topProducts?: Array<{ label?: string; name?: string; hs_code?: string; count?: number }> | null;
  hs_categories?: Array<{ label?: string; name?: string; hs_code?: string; count?: number }> | null;
  topSuppliers?:
    | Array<string | { name?: string; country?: string; countryCode?: string; country_code?: string; shipments?: number }>
    | null;
  topContainerLength?: string | null;
  containers?: { fclShipments12m?: number | null; lclShipments12m?: number | null } | null;
  fcl_shipments_all_time?: number | null;
  lcl_shipments_all_time?: number | null;
};

/**
 * The 7-stage CRM pipeline enforced by the `lit_saved_companies_stage_check`
 * CHECK constraint and the `update_saved_company_stage(uuid, text)` RPC.
 * Legacy values (prospect/active/customer/churned) are still rendered in
 * a fallback tone if they slip in from stale cached payloads, but the
 * selector only writes back canonical 7-stage values.
 */
export const CRM_STAGE_VALUES = [
  "lead",
  "prospecting",
  "needs_analysis",
  "quoting",
  "contract_negotiation",
  "closed_won",
  "closed_lost",
] as const;
export type CrmStageValue = (typeof CRM_STAGE_VALUES)[number] | (string & {});

type CDPDetailsPanelProps = {
  company: DetailsCompany;
  kpis: DetailsKpis;
  profile?: Profile | null;
  ownerName?: string | null;
  ownerInitials?: string | null;
  lists?: Array<{ id: string | number; name: string }> | null;
  campaigns?: Array<{ id: string | number; name: string }> | null;
  /**
   * Real CRM pipeline stage for this company under the current user
   * (e.g., from `lit_saved_companies.stage`). When `savedPresent` is
   * false (the company is not saved by the calling user), the CRM
   * stage row is hidden entirely — there's nothing for the user to
   * update until they save the company first.
   */
  crmStage?: CrmStageValue | null;
  /** Canonical UUID for the company. Required to drive the
   *  `update_saved_company_stage` RPC. When missing, the selector
   *  falls back to a read-only pill so we never POST garbage to the
   *  RPC. */
  companyId?: string | null;
  /** True when there's a `lit_saved_companies` row for this user +
   *  company pair. Drives whether the interactive selector shows
   *  (saved) or the row is hidden (unsaved). */
  savedPresent?: boolean;
  /** Called with the new stage after a successful RPC write. The
   *  parent typically refetches the company bundle so any other
   *  consumers of `bundle.identity.sources.saved.stage` see the new
   *  value. */
  onStageChange?: (nextStage: CrmStageValue) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  /** ISO timestamp of the most recent enrichment write (Phase B.15 cache row). */
  snapshotUpdatedAt?: string | null;
  /** Saved contacts pushed up from CDPContacts. Used to render the
   *  Verified Contacts summary block in the right rail. */
  contacts?: Array<{
    id?: string | number;
    full_name?: string | null;
    name?: string | null;
    title?: string | null;
    email?: string | null;
    enriched_at?: string | null;
    enrichment_status?: string | null;
    verified_by_provider?: boolean | null;
    email_verification_status?: string | null;
  }> | null;
  /** Switches the parent's active tab to Contacts when the user clicks
   *  the "View contacts" button in the Verified Contacts block. */
  onOpenContactsTab?: () => void;
  /** Switches the parent's active tab to the Supply Chain tab (which
   *  hosts the Suppliers view) when the user clicks the Top Supplier
   *  tile in the Trade Intelligence section. */
  onOpenSuppliersTab?: () => void;
};

export default function CDPDetailsPanel({
  company,
  kpis,
  profile,
  ownerName,
  ownerInitials,
  lists,
  campaigns,
  onRefresh,
  refreshing,
  snapshotUpdatedAt,
  contacts,
  onOpenContactsTab,
  onOpenSuppliersTab,
  crmStage,
  companyId,
  savedPresent,
  onStageChange,
}: CDPDetailsPanelProps) {
  const [open, setOpen] = useState({
    account: true,
    lists: true,
    firm: true,
    intel: true,
    verified: true,
  });
  const toggle = (k: keyof typeof open) =>
    setOpen((s) => ({ ...s, [k]: !s[k] }));

  // Phase 6 — right-rail trade-intel rows now fall back through profile
  // shapes AND recentBols when the explicit list isn't surfaced. Order
  // mirrors CDPSupplyChain's `derive*` helpers so the right rail and the
  // tab bodies can never disagree on what data is available.
  const recentBols: any[] = useMemo(
    () =>
      profile?.recentBols ||
      profile?.recent_bols ||
      profile?.bols ||
      profile?.shipments ||
      [],
    [profile],
  );

  const topCarrier = useMemo(() => {
    const list =
      profile?.topCarriers || profile?.carrier_mix || profile?.carriers;
    if (Array.isArray(list) && list.length > 0) {
      const head = list[0] as any;
      const name = head?.carrierName || head?.name || head?.carrier;
      if (name) return name;
    }
    // Fall back to most-frequent carrier across recent BOLs.
    const counts = new Map<string, number>();
    for (const bol of recentBols) {
      const name = readBolCarrier(bol);
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    if (counts.size === 0) return null;
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }, [profile?.topCarriers, profile?.carrier_mix, profile?.carriers, recentBols]);

  // Top Supplier — sourced from parsed_summary.top_suppliers (the
  // structured shape introduced in importyeti_fetch v2). Renamed from
  // "Top Forwarder" because (a) parsed_summary.top_forwarders was
  // never populated, and (b) the BOL fallback that previously filled
  // the gap actually returned the supplier/shipper name. Labeling it
  // "Top Forwarder" was misleading. The widget now correctly shows
  // the highest-shipment supplier and links to the Suppliers tab.
  const topSupplier = useMemo(() => {
    const list = profile?.topSuppliers ?? (profile as any)?.top_suppliers;
    if (!Array.isArray(list) || list.length === 0) return null;
    const head = normalizeSupplier(list[0]);
    return head.name ? head : null;
  }, [profile?.topSuppliers, (profile as any)?.top_suppliers]);

  const topMode = useMemo(() => {
    const list = profile?.topModes;
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[0]?.mode || null;
  }, [profile?.topModes]);

  const fclLclSplit = useMemo(() => {
    const fcl =
      Number(profile?.containers?.fclShipments12m) ||
      Number(profile?.fcl_shipments_all_time) ||
      0;
    const lcl =
      Number(profile?.containers?.lclShipments12m) ||
      Number(profile?.lcl_shipments_all_time) ||
      0;
    if (fcl + lcl === 0) return null;
    const total = fcl + lcl;
    return {
      fclPct: Math.round((fcl / total) * 100),
      lclPct: Math.round((lcl / total) * 100),
    };
  }, [profile?.containers, profile?.fcl_shipments_all_time, profile?.lcl_shipments_all_time]);

  const topHs = useMemo(() => {
    // v200: hs_profile is an object with topChapters[] + topHsChapter
    const hsObj =
      (profile?.hsProfile && typeof profile.hsProfile === "object" && !Array.isArray(profile.hsProfile))
        ? profile.hsProfile
        : (profile?.hs_profile && typeof profile.hs_profile === "object" && !Array.isArray(profile.hs_profile))
          ? profile.hs_profile
          : null;
    if (hsObj) {
      const head = hsObj.topHsChapter || (Array.isArray(hsObj.topChapters) ? hsObj.topChapters[0] : null);
      if (head) {
        const label = head?.description || head?.label || head?.name || head?.commodity;
        if (label) {
          return {
            label: String(label),
            hsCode: head?.hsCode || head?.hs_code || head?.code || null,
          };
        }
      }
    }
    const list =
      profile?.topProducts ||
      profile?.hs_categories ||
      (Array.isArray(profile?.hs_profile) ? profile?.hs_profile : null) ||
      (Array.isArray(profile?.hsProfile) ? profile?.hsProfile : null);
    if (Array.isArray(list) && list.length > 0) {
      const head = list[0] as any;
      const label = head?.label || head?.name || head?.description || head?.commodity;
      if (label) {
        return {
          label: String(label),
          hsCode: head?.hs_code || head?.hsCode || head?.code || null,
        };
      }
    }
    // Fall back to most-frequent HS / description across recent BOLs.
    const counts = new Map<string, { count: number; hs: string | null }>();
    for (const bol of recentBols) {
      const hs =
        bol?.hs_code ||
        bol?.hsCode ||
        bol?.hts_code ||
        bol?.commodity_code ||
        bol?.raw?.hs_code ||
        null;
      const desc =
        bol?.description ||
        bol?.product_description ||
        bol?.commodity ||
        bol?.commodity_description ||
        bol?.cargo_description ||
        bol?.raw?.product_description ||
        null;
      const key = String(hs || desc || "").trim();
      if (!key) continue;
      const cur = counts.get(key) || { count: 0, hs: hs ? String(hs) : null };
      cur.count += 1;
      counts.set(key, cur);
    }
    if (counts.size === 0) return null;
    const head = Array.from(counts.entries()).sort(
      (a, b) => b[1].count - a[1].count,
    )[0];
    return { label: head[0], hsCode: head[1].hs };
  }, [
    profile?.topProducts,
    profile?.hs_categories,
    profile?.hs_profile,
    profile?.hsProfile,
    recentBols,
  ]);

  const primaryLane = useMemo(
    () => derivePrimaryLane(kpis.topRoute || kpis.recentRoute),
    [kpis.topRoute, kpis.recentRoute],
  );

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white lg:flex">
      <div className="flex-1 overflow-y-auto">
        {/* Account Details */}
        <Section
          id="account"
          title="Account Details"
          open={open.account}
          onToggle={() => toggle("account")}
        >
          <Row icon={<User />} label="Owner">
            {ownerName ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="font-display flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-[9px] font-bold text-white"
                >
                  {ownerInitials || ownerName.charAt(0)}
                </span>
                <span className="truncate">{ownerName}</span>
              </span>
            ) : (
              "—"
            )}
          </Row>
          <Row icon={<Clock />} label="Last activity">
            {formatRelative(kpis.lastShipment)}
          </Row>
          {savedPresent ? (
            <Row icon={<Briefcase />} label="CRM stage">
              <CrmStageSelector
                companyId={companyId ?? null}
                stage={(crmStage as CrmStageValue) ?? "lead"}
                onChanged={onStageChange}
              />
            </Row>
          ) : null}
          <Row icon={<Target />} label="Imports to">
            {company.countryCode || company.countryName ? (
              <LitPill tone="slate">
                {company.countryName || company.countryCode}
              </LitPill>
            ) : (
              "—"
            )}
          </Row>
        </Section>

        {/* Lists & Campaigns */}
        <Section
          id="lists"
          title="Lists & Campaigns"
          open={open.lists}
          onToggle={() => toggle("lists")}
        >
          <div className="px-3.5 pb-2 pt-1">
            <Eyebrow>Lists</Eyebrow>
            <div className="flex flex-wrap gap-1 py-0.5">
              {Array.isArray(lists) && lists.length > 0 ? (
                lists.slice(0, 4).map((l) => (
                  <LitPill key={l.id} tone="blue">
                    {l.name}
                  </LitPill>
                ))
              ) : (
                <span className="font-body text-[11px] text-slate-300">—</span>
              )}
              {Array.isArray(lists) && lists.length > 4 && (
                <LitPill tone="slate">+{lists.length - 4} more</LitPill>
              )}
            </div>

            <Eyebrow className="mt-2">Campaigns</Eyebrow>
            <div className="flex flex-wrap gap-1 py-0.5">
              {Array.isArray(campaigns) && campaigns.length > 0 ? (
                campaigns.slice(0, 4).map((c) => (
                  <LitPill key={c.id} tone="amber">
                    {c.name}
                  </LitPill>
                ))
              ) : (
                <span className="font-body text-[11px] text-slate-300">—</span>
              )}
              {Array.isArray(campaigns) && campaigns.length > 4 && (
                <LitPill tone="slate">+{campaigns.length - 4} more</LitPill>
              )}
            </div>
          </div>
        </Section>

        {/* Verified Contacts — saved-contact summary block */}
        <VerifiedContactsBlock
          contacts={contacts || []}
          open={open.verified}
          onToggle={() => toggle("verified")}
          onOpenContactsTab={onOpenContactsTab}
        />

        {/* Firmographics */}
        <Section
          id="firm"
          title="Firmographics"
          open={open.firm}
          onToggle={() => toggle("firm")}
        >
          <Row icon={<Globe />} label="Website">
            {company.website || company.domain ? (
              <a
                href={
                  company.website ||
                  (company.domain
                    ? `https://${company.domain}`
                    : "#")
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700"
              >
                {company.domain || stripScheme(company.website || "")}
              </a>
            ) : (
              "—"
            )}
          </Row>
          <Row icon={<Phone />} label="Phone" mono>
            {company.phone || "—"}
          </Row>
          <Row icon={<MapPin />} label="HQ">
            {company.address || "—"}
          </Row>
          <Row icon={<Building2 />} label="Industry">
            {profile?.industry || "—"}
          </Row>
          <Row icon={<Users />} label="Headcount" mono>
            {profile?.employeeCount != null
              ? formatNumberCompact(Number(profile.employeeCount))
              : "—"}
          </Row>
          <Row icon={<DollarSign />} label="Revenue" mono>
            {profile?.estimatedRevenue
              ? formatRevenue(profile.estimatedRevenue)
              : "—"}
          </Row>
          <Row icon={<Calendar />} label="Founded" mono>
            {profile?.yearFounded ? String(profile.yearFounded) : "—"}
          </Row>
        </Section>

        {/* Trade Intelligence */}
        <Section
          id="intel"
          title="Trade Intelligence"
          open={open.intel}
          onToggle={() => toggle("intel")}
        >
          <Row icon={<TrendingUp />} label="Top lane" accent>
            {primaryLane || "—"}
          </Row>
          <Row icon={<Ship />} label="Top carrier">
            {topCarrier || "—"}
          </Row>
          {topSupplier ? (
            <div className="px-4 py-2">
              <button
                type="button"
                onClick={() => onOpenSuppliersTab?.()}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Top supplier
                  </div>
                  <div className="font-display mt-0.5 truncate text-sm font-semibold text-slate-900">
                    {topSupplier.name}
                  </div>
                  {topSupplier.country ? (
                    <div className="font-body truncate text-[11px] text-slate-500">
                      {topSupplier.country}
                    </div>
                  ) : null}
                </div>
                <span aria-hidden className="text-slate-400">→</span>
              </button>
            </div>
          ) : null}
          <Row icon={<Package />} label="Top mode">
            {topMode || "—"}
          </Row>
          <Row icon={<Container />} label="Dominant container">
            {profile?.topContainerLength || "—"}
          </Row>
          <Row icon={<BarChart2 />} label="FCL / LCL">
            {fclLclSplit ? (
              <span className="inline-flex items-center gap-1">
                <LitPill tone="blue">FCL {fclLclSplit.fclPct}%</LitPill>
                <LitPill tone="purple">LCL {fclLclSplit.lclPct}%</LitPill>
              </span>
            ) : (
              "—"
            )}
          </Row>
          <Row icon={<Hash />} label="Top HS">
            {topHs ? (
              <span className="inline-flex items-center gap-1">
                {topHs.hsCode && (
                  <span className="font-mono text-[10px] text-slate-500">
                    {topHs.hsCode}
                  </span>
                )}
                <span className="truncate">{topHs.label}</span>
              </span>
            ) : (
              "—"
            )}
          </Row>
          <Row icon={<Clock />} label="Last shipment" mono>
            {formatRelative(kpis.lastShipment) || "—"}
          </Row>
          <Row icon={<Clock />} label="Data freshness">
            {snapshotUpdatedAt ? formatRelative(snapshotUpdatedAt) : "—"}
          </Row>
          <Row icon={<BarChart2 />} label="Volume">
            {kpis.shipments != null && kpis.shipments > 0 ? (
              <LitPill tone="green">
                {Number(kpis.shipments).toLocaleString()} ship
              </LitPill>
            ) : (
              "—"
            )}
          </Row>
        </Section>

        {/* Refresh enrichment */}
        <div className="px-3.5 py-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="font-display inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {refreshing ? "Refreshing…" : "Refresh enrichment"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Section({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100" id={`cdp-panel-${id}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between bg-[#FAFBFC] px-3.5 py-2.5"
      >
        <span className="font-display whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.06em] text-slate-900">
          {title}
        </span>
        {open ? (
          <ChevronUp className="h-3 w-3 text-slate-500" />
        ) : (
          <ChevronDown className="h-3 w-3 text-slate-500" />
        )}
      </button>
      {open && <div className="py-1">{children}</div>}
    </div>
  );
}

function Row({
  icon,
  label,
  children,
  mono,
  accent,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className="grid items-center gap-2 px-3.5 py-1.5"
      style={{ gridTemplateColumns: "92px 1fr", minHeight: 30 }}
    >
      <div className="font-body flex items-center gap-1.5 text-[11px] text-slate-500">
        {icon && (
          <span className="flex h-[11px] w-[11px] items-center justify-center text-slate-400 [&>svg]:h-[11px] [&>svg]:w-[11px]">
            {icon}
          </span>
        )}
        {label}
      </div>
      <div
        className={[
          "min-w-0 truncate text-[12px]",
          mono ? "font-mono" : "font-body",
          accent ? "font-semibold text-blue-700" : "text-slate-900",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "font-display whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

function derivePrimaryLane(topRoute?: string | null) {
  if (!topRoute || typeof topRoute !== "string") return null;
  const parts = topRoute.split(/→|->|>/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const fromMeta = resolveEndpoint(parts[0]);
  const toMeta = resolveEndpoint(parts[1]);
  const fromLabel = fromMeta?.countryCode || fromMeta?.countryName || parts[0];
  const toLabel = toMeta?.countryCode || toMeta?.countryName || parts[1];
  return `${fromLabel} → ${toLabel}`;
}

function formatRelative(value?: string | null) {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  if (delta < 0) return "—";
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (delta < hour) return "just now";
  if (delta < day) return `${Math.round(delta / hour)} hours ago`;
  if (delta < 2 * day) return "1 day ago";
  if (delta < 30 * day) return `${Math.round(delta / day)} days ago`;
  if (delta < 365 * day) return `${Math.round(delta / (30 * day))} months ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatNumberCompact(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Math.round(n).toLocaleString();
}

function formatRevenue(value: number | string) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${Math.round(n).toLocaleString()}`;
  }
  return String(value);
}

// Phase 6 — local mirror of CDPSupplyChain's carrier read so the right
// rail can fall back to BOL-derived carriers without importing the whole
// supply-chain helper module. Surfaces direct carrier names first; falls
// back to the verbatim Master Bill prefix (no client-side carrier-name
// normalization, per Phase 5 directive).
function readBolCarrier(bol: any): string | null {
  const direct =
    bol?.carrier_name ||
    bol?.carrier ||
    bol?.shipping_line ||
    bol?.steamship_line ||
    bol?.normalized_carrier ||
    bol?.inferred_carrier ||
    bol?.scac ||
    bol?.raw?.carrier_name ||
    bol?.raw?.shipping_line ||
    null;
  if (direct) return String(direct);
  const mbl =
    bol?.master_bill_of_lading_number ||
    bol?.mbl ||
    bol?.master_bill_prefix ||
    bol?.mbl_prefix ||
    bol?.raw?.master_bill_of_lading_number ||
    null;
  if (mbl) {
    const prefix = String(mbl).slice(0, 4).toUpperCase();
    if (/^[A-Z]{4}$/.test(prefix)) return prefix;
  }
  return null;
}

function stripScheme(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/* ── Verified Contacts block ──────────────────────────────────────── */

function VerifiedContactsBlock({
  contacts,
  open,
  onToggle,
  onOpenContactsTab,
}: {
  contacts: NonNullable<CDPDetailsPanelProps["contacts"]>;
  open: boolean;
  onToggle: () => void;
  onOpenContactsTab?: () => void;
}) {
  const total = contacts.length;
  const verified = contacts.filter((c) => {
    const status = String(c.email_verification_status || "").toLowerCase();
    return (
      c.verified_by_provider === true ||
      status === "verified" ||
      status === "valid" ||
      status === "deliverable"
    );
  }).length;
  const enriched = contacts.filter(
    (c) => String(c.enrichment_status || "").toLowerCase() === "enriched",
  ).length;
  const lastEnrichedIso = contacts
    .map((c) => c.enriched_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop();
  const lastEnriched = lastEnrichedIso
    ? formatRelativeShort(lastEnrichedIso)
    : null;

  // Most-frequent title across saved contacts.
  const titleCounts = new Map<string, number>();
  for (const c of contacts) {
    if (!c.title) continue;
    const t = String(c.title).trim();
    titleCounts.set(t, (titleCounts.get(t) || 0) + 1);
  }
  const topTitle =
    Array.from(titleCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    null;

  return (
    <Section
      id="verified"
      title="Verified Contacts"
      open={open}
      onToggle={onToggle}
    >
      {total === 0 ? (
        <div className="font-body px-3 py-2 text-[11px] text-slate-500">
          No saved contacts yet. Use{" "}
          <button
            type="button"
            onClick={onOpenContactsTab}
            className="font-display font-semibold text-blue-600 hover:text-blue-800"
          >
            Find contacts with LIT
          </button>{" "}
          to discover and enrich the buying committee.
        </div>
      ) : (
        <>
          <Row icon={<Users />} label="Saved">
            <span className="font-mono text-[12px] font-semibold text-slate-900">
              {total}
            </span>
          </Row>
          <Row icon={<User />} label="Verified email">
            <span
              className={[
                "font-mono text-[12px] font-semibold",
                verified > 0 ? "text-emerald-700" : "text-slate-400",
              ].join(" ")}
            >
              {verified}
            </span>
          </Row>
          <Row icon={<Briefcase />} label="LIT Enriched">
            <span
              className={[
                "font-mono text-[12px] font-semibold",
                enriched > 0 ? "text-violet-700" : "text-slate-400",
              ].join(" ")}
            >
              {enriched}
            </span>
          </Row>
          {topTitle && (
            <Row icon={<Target />} label="Primary persona">
              <span className="font-display truncate text-[12px] font-semibold text-slate-900">
                {topTitle}
              </span>
            </Row>
          )}
          <Row icon={<Clock />} label="Last enriched">
            <span className="font-mono text-[11px] text-slate-600">
              {lastEnriched || "—"}
            </span>
          </Row>
        </>
      )}
      <div className="mt-2 flex flex-col gap-1.5 px-1">
        <button
          type="button"
          onClick={onOpenContactsTab}
          className="font-display inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          View contacts
        </button>
        <button
          type="button"
          onClick={onOpenContactsTab}
          className="font-display inline-flex items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-violet-500 to-violet-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm hover:from-violet-600 hover:to-violet-700"
        >
          Find contacts with LIT
        </button>
      </div>
    </Section>
  );
}

/**
 * Map the 7-stage pipeline onto LitPill tones. Legacy values that
 * sneak in from stale cached payloads still resolve to a sensible
 * tone so the pill never renders an undefined color class.
 */
function crmStageTone(stage: string): import("@/components/ui/LitPill").LitPillTone {
  const s = String(stage).toLowerCase().trim();
  switch (s) {
    case "lead":
    case "new":
      return "slate";
    case "prospecting":
    case "prospect":
    case "active":
    case "open":
      return "blue";
    case "needs_analysis":
      return "cyan";
    case "quoting":
      return "amber";
    case "contract_negotiation":
      return "purple";
    case "closed_won":
    case "customer":
    case "won":
      return "green";
    case "closed_lost":
    case "churned":
    case "lost":
      return "red";
    default:
      return "slate";
  }
}

function crmStageLabel(stage: string): string {
  const s = String(stage).toLowerCase().trim();
  switch (s) {
    case "lead":
      return "Lead";
    case "prospecting":
      return "Prospecting";
    case "needs_analysis":
      return "Needs Analysis";
    case "quoting":
      return "Quoting";
    case "contract_negotiation":
      return "Contract / Negotiation";
    case "closed_won":
      return "Closed Won";
    case "closed_lost":
      return "Closed Lost";
    // Legacy fallbacks — preserve a readable label until the next
    // refetch surfaces the migrated value.
    case "prospect":
    case "active":
      return "Prospecting";
    case "customer":
    case "won":
      return "Closed Won";
    case "churned":
    case "lost":
      return "Closed Lost";
    default:
      if (!s) return "—";
      return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
  }
}

/* ── Interactive CRM stage selector ──────────────────────────────────
 *
 * Click the pill → popover menu with all 7 stages. Selecting a stage
 * fires `update_saved_company_stage(uuid, text)` on the Supabase
 * backend (SECURITY DEFINER, scoped by auth.uid()). The pill flips
 * optimistically; on RPC error we revert and surface a small inline
 * error label so the user sees the change was rejected.
 *
 * Note on the popover: the codebase doesn't ship a shared Listbox /
 * Popover primitive in `@/components/ui` yet (LitPill, LitPanel,
 * LitSidebar, etc. are display-only). Rather than pull in a new
 * dependency just for this control, we render a self-contained
 * absolute-positioned menu with click-outside + Escape handlers,
 * matching the visual language of LitPill so it slots into the
 * right-rail without re-skinning the surrounding rows.
 */
function CrmStageSelector({
  companyId,
  stage,
  onChanged,
}: {
  companyId: string | null;
  stage: CrmStageValue;
  onChanged?: (next: CrmStageValue) => void;
}) {
  const [displayStage, setDisplayStage] = useState<CrmStageValue>(stage);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // Popover rendered into document.body via portal to escape ancestor
  // overflow:hidden / overflow:auto clipping (the side panel uses both,
  // plus the Row cell uses Tailwind `truncate` which sets overflow:hidden).
  // Track the button's bounding rect so we can pin the popover to the
  // correct screen position with `position:fixed`.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // Re-sync local state when the parent prop changes (e.g. after a
  // refetch lands the canonical value from the bundle).
  useEffect(() => {
    setDisplayStage(stage);
  }, [stage]);

  // When the popover opens, measure the button position so we can pin
  // the portal'd popover to the right place. Re-measure on resize so the
  // popover doesn't float away if the user resizes the window while open.
  useEffect(() => {
    if (!open) {
      setPopoverPos(null);
      return;
    }
    function measure() {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    }
    measure();
    window.addEventListener("resize", measure);
    // Close on scroll — popover-following-scroll feels finicky and a
    // brief close-and-reopen is friendlier than a popover that drifts.
    function onScroll() {
      setOpen(false);
    }
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Click-outside + Escape to dismiss. Now checks BOTH the trigger
  // (rootRef) AND the portal'd popover (popoverRef) — otherwise clicking
  // inside the popover would close it before the option's onClick fires.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Defense in depth: the `update_saved_company_stage` RPC requires a
  // UUID for `p_company_id`. If the parent ever passes a slug or other
  // non-UUID string (regressions are easy when wiring is touched), flip
  // the selector to read-only mode so we never POST garbage that the RPC
  // rejects with a cast error.
  const isUuid = (s: string | null | undefined): s is string =>
    !!s &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const canEdit = isUuid(companyId);

  async function selectStage(next: CrmStageValue) {
    setOpen(false);
    if (!canEdit) return;
    if (next === displayStage) return;

    const prev = displayStage;
    setDisplayStage(next); // optimistic
    setSaving(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "update_saved_company_stage",
        { p_company_id: companyId, p_stage: next },
      );
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      const persisted = (row?.stage as CrmStageValue | undefined) ?? next;
      setDisplayStage(persisted);
      onChanged?.(persisted);
    } catch (err: any) {
      // Revert optimistic update so the user sees the change was
      // rejected. Surface a short, human-readable error label.
      setDisplayStage(prev);
      const msg = String(err?.message || err || "Failed to update");
      setError(humanizeStageError(msg));
      // Clear the inline error after a few seconds — it's not a
      // toast, just a hint.
      window.setTimeout(() => setError(null), 4000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => canEdit && setOpen((v) => !v)}
        disabled={!canEdit || saving}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "inline-flex items-center gap-1 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300/60",
          canEdit ? "cursor-pointer hover:opacity-90" : "cursor-default",
          saving ? "opacity-70" : "",
        ].join(" ")}
        title={canEdit ? "Change CRM stage" : "CRM stage"}
      >
        <LitPill tone={crmStageTone(displayStage)}>
          {crmStageLabel(displayStage)}
        </LitPill>
        {canEdit && (
          <span className="flex h-3 w-3 items-center justify-center text-slate-400">
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </span>
        )}
      </button>

      {open && popoverPos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            aria-label="Select CRM stage"
            style={{
              position: "fixed",
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`,
              zIndex: 9999,
            }}
            className="w-[200px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
          >
            <ul className="py-1">
              {CRM_STAGE_VALUES.map((s) => {
                const active = s === displayStage;
                return (
                  <li key={s}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => selectStage(s)}
                      className={[
                        "font-display flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] font-semibold",
                        active
                          ? "bg-slate-50 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={[
                            "inline-block h-1.5 w-1.5 rounded-full",
                            stageDotClass(crmStageTone(s)),
                          ].join(" ")}
                        />
                        {crmStageLabel(s)}
                      </span>
                      {active && (
                        <Check className="h-3 w-3 text-slate-500" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}

      {error && (
        <span
          role="alert"
          className="font-body mt-0.5 max-w-[220px] truncate text-[10px] text-red-600"
          title={error}
        >
          {error}
        </span>
      )}
    </div>
  );
}

function stageDotClass(
  tone: import("@/components/ui/LitPill").LitPillTone,
): string {
  switch (tone) {
    case "slate":
      return "bg-slate-400";
    case "blue":
      return "bg-blue-500";
    case "cyan":
      return "bg-cyan-500";
    case "amber":
      return "bg-amber-500";
    case "purple":
      return "bg-purple-500";
    case "violet":
      return "bg-violet-500";
    case "green":
      return "bg-green-500";
    case "red":
      return "bg-red-500";
    default:
      return "bg-slate-400";
  }
}

function humanizeStageError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("company_not_saved_by_user")) {
    return "Save this company before updating the stage.";
  }
  if (msg.includes("invalid_stage")) {
    return "That stage isn't supported.";
  }
  if (msg.includes("unauthenticated")) {
    return "Sign in again to update the stage.";
  }
  return "Couldn't update stage. Try again.";
}

function formatRelativeShort(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString();
}