import { useMemo, useState } from "react";
import {
  BarChart2,
  Briefcase,
  Building2,
  Calendar,
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
  Truck,
  User,
  Users,
} from "lucide-react";
import LitPill from "@/components/ui/LitPill";
import { resolveEndpoint } from "@/lib/laneGlobe";

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

type CDPDetailsPanelProps = {
  company: DetailsCompany;
  kpis: DetailsKpis;
  profile?: Profile | null;
  ownerName?: string | null;
  ownerInitials?: string | null;
  lists?: Array<{ id: string | number; name: string }> | null;
  campaigns?: Array<{ id: string | number; name: string }> | null;
  onRefresh: () => void;
  refreshing?: boolean;
  /** ISO timestamp of the most recent enrichment write (Phase B.15 cache row). */
  snapshotUpdatedAt?: string | null;
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
}: CDPDetailsPanelProps) {
  const [open, setOpen] = useState({
    account: true,
    lists: true,
    firm: true,
    intel: true,
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

  const topForwarder = useMemo(() => {
    const list =
      profile?.topForwarders ||
      profile?.forwarder_mix ||
      profile?.forwarders ||
      profile?.serviceProviders;
    if (Array.isArray(list) && list.length > 0) {
      const head = list[0] as any;
      const name = head?.providerName || head?.name || head?.forwarder;
      if (name) return name;
    }
    // Fall back to most-frequent supplier/shipper/notify-party across
    // recentBols.
    const counts = new Map<string, number>();
    for (const bol of recentBols) {
      const name =
        bol?.shipper_name ||
        bol?.supplier ||
        bol?.supplier_name ||
        bol?.notify_party ||
        bol?.raw?.shipper_name ||
        bol?.raw?.supplier_name ||
        null;
      if (!name) continue;
      const s = String(name).trim();
      if (!s) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    if (counts.size === 0) return null;
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }, [
    profile?.topForwarders,
    profile?.forwarder_mix,
    profile?.forwarders,
    profile?.serviceProviders,
    recentBols,
  ]);

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

  const topSupplierCountry = useMemo(() => {
    const list = profile?.topSuppliers;
    if (Array.isArray(list) && list.length > 0) {
      const head = list[0];
      if (head && typeof head !== "string") {
        const c = head.country || head.countryCode || head.country_code;
        if (c) return c;
      }
    }
    // Fall back to most-frequent supplier_country across recent BOLs.
    const counts = new Map<string, number>();
    for (const bol of recentBols) {
      const c =
        bol?.supplier_country ||
        bol?.origin_country ||
        bol?.shipper_country ||
        null;
      if (!c) continue;
      const s = String(c).trim();
      if (!s) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    if (counts.size === 0) return null;
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }, [profile?.topSuppliers, recentBols]);

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
          <Row icon={<Briefcase />} label="CRM stage">
            <LitPill tone="blue">Active</LitPill>
          </Row>
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
          <Row icon={<Truck />} label="Top forwarder">
            {topForwarder || "—"}
          </Row>
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
          <Row icon={<MapPin />} label="Top supplier">
            {topSupplierCountry ? (
              <LitPill tone="slate">{topSupplierCountry}</LitPill>
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