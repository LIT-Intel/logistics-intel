/**
 * Quoting Dashboard — the `/app/quoting` page.
 *
 * Self-contained, exported component. NOT yet routed (Task 12 wires routes).
 * Renders three stacked regions inside the app shell:
 *   1. Page header with a "New Quote" primary CTA.
 *   2. A 5-card KPI row fed by `quoting.dashboardMetrics()`.
 *   3. A status-filter tab strip driving a `quoting.list({ status })` table
 *      wrapped in `LitSectionCard`.
 *
 * Honest data only: loading shows a skeleton, empty shows a real empty state,
 * and zero rows are never faked.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FilePenLine,
  Send,
  BadgeCheck,
  CircleDollarSign,
  Layers,
  Plus,
  Ship,
  Plane,
  Truck,
  Container,
  ArrowRight,
  Eye,
  Copy,
  FileText,
} from "lucide-react";

import { quoting } from "@/api/quoting";
import type { QuoteStatus, QuoteListItem, QuoteMode } from "@/api/quoting";
import EnhancedKpiCard from "@/components/dashboard/EnhancedKpiCard";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { QuoteStatusPill } from "@/features/quoting/components/QuoteStatusPill";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// UI filter tabs. "All" carries no status. "Won"/"Lost" map to the
// closed_won / closed_lost server statuses.
type FilterKey = "all" | "draft" | "sent" | "viewed" | "approved" | "won" | "lost";

const FILTER_TABS: { key: FilterKey; label: string; status?: QuoteStatus }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft", status: "draft" },
  { key: "sent", label: "Sent", status: "sent" },
  { key: "viewed", label: "Viewed", status: "viewed" },
  { key: "approved", label: "Approved", status: "approved" },
  { key: "won", label: "Won", status: "closed_won" },
  { key: "lost", label: "Lost", status: "closed_lost" },
];

const MODE_META: Record<QuoteMode, { Icon: typeof Ship; label: string }> = {
  ocean: { Icon: Ship, label: "Ocean" },
  air: { Icon: Plane, label: "Air" },
  drayage: { Icon: Container, label: "Drayage" },
  ftl: { Icon: Truck, label: "FTL" },
  ltl: { Icon: Truck, label: "LTL" },
};

function initialsFor(name?: string | null): string {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

function laneEndpoint(port?: string | null, city?: string | null): string | null {
  return port || city || null;
}

function formatValidUntil(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMargin(pct?: number | null): string {
  if (pct == null || !Number.isFinite(Number(pct))) return "—";
  return `${Number(pct).toFixed(1)}%`;
}

export default function QuotingDashboard() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>("all");

  const activeTab = FILTER_TABS.find((t) => t.key === filter) ?? FILTER_TABS[0];
  const statusArg = activeTab.status;

  const metricsQuery = useQuery({
    queryKey: ["quoting", "dashboard-metrics"],
    queryFn: () => quoting.dashboardMetrics(),
  });

  const listQuery = useQuery({
    queryKey: ["quoting", "list", statusArg ?? "all"],
    queryFn: () => quoting.list(statusArg ? { status: statusArg } : {}),
  });

  const metrics = metricsQuery.data?.data;
  const quotes: QuoteListItem[] = listQuery.data?.items ?? [];

  const kpis = [
    {
      icon: FilePenLine,
      label: "Draft Value",
      value: money.format(metrics?.draft ?? 0),
      iconColor: "#475569",
    },
    {
      icon: Send,
      label: "Sent Value",
      value: money.format(metrics?.sent ?? 0),
      iconColor: "#2563eb",
    },
    {
      icon: BadgeCheck,
      label: "Approved Value",
      value: money.format(metrics?.approved ?? 0),
      iconColor: "#0891b2",
    },
    {
      icon: CircleDollarSign,
      label: "Won Revenue",
      value: money.format(metrics?.won ?? 0),
      iconColor: "#059669",
    },
    {
      icon: Layers,
      label: "Open Pipeline",
      value: money.format(metrics?.open_pipeline ?? 0),
      iconColor: "#7c3aed",
    },
  ];

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 max-w-[1320px] w-full mx-auto">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">
        <div>
          <h1
            className="text-[20px] sm:text-[23px] font-bold text-slate-900 tracking-[-0.4px]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Quoting
          </h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            Turn freight intelligence into priced, sent, and tracked revenue.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/quoting/new")}
          className="inline-flex items-center justify-center gap-2 h-10 w-full sm:w-auto px-4 rounded-[10px] text-[13.5px] font-semibold text-white transition hover:brightness-105"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            background: "linear-gradient(180deg,#2563eb,#1d4ed8)",
            boxShadow:
              "0 6px 16px rgba(37,99,235,.28), inset 0 1px 0 rgba(255,255,255,.18)",
          }}
        >
          <Plus className="w-4 h-4" />
          New Quote
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {kpis.map((k, i) => (
          <EnhancedKpiCard
            key={k.label}
            icon={k.icon}
            label={k.label}
            value={metricsQuery.isLoading ? "—" : k.value}
            iconColor={k.iconColor}
            href="/app/quoting"
            delay={i * 0.04}
          />
        ))}
      </div>

      {/* Quotes table */}
      <LitSectionCard
        title="All Quotes"
        sub={
          listQuery.isLoading
            ? "Loading…"
            : `${quotes.length} ${quotes.length === 1 ? "quote" : "quotes"}`
        }
        padded={false}
      >
        {/* Status filter tabs — horizontally scrollable on mobile */}
        <div className="flex gap-1.5 px-3 sm:px-4 py-3 border-b border-slate-100 overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const on = tab.key === filter;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={
                  "flex-shrink-0 inline-flex items-center h-10 px-3 rounded-lg text-[11.5px] font-semibold border transition " +
                  (on
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300")
                }
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body: loading / empty / table */}
        {listQuery.isLoading ? (
          <QuotesSkeleton />
        ) : quotes.length === 0 ? (
          <EmptyState onNew={() => navigate("/app/quoting/new")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#FAFBFC]">
                  <Th>Quote #</Th>
                  <Th>Company</Th>
                  <Th>Mode</Th>
                  <Th>Lane</Th>
                  <Th>Status</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Gross Profit</Th>
                  <Th align="right">Margin</Th>
                  <Th>Owner</Th>
                  <Th>Valid Until</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <QuoteRow
                    key={q.id}
                    quote={q}
                    onOpen={() => navigate(`/app/quoting/${q.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LitSectionCard>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={
        "px-3.5 py-3 border-b border-slate-100 whitespace-nowrap " +
        (align === "right" ? "text-right" : "text-left")
      }
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#94A3B8",
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {children}
    </th>
  );
}

function QuoteRow({
  quote,
  onOpen,
}: {
  quote: QuoteListItem;
  onOpen: () => void;
}) {
  const mode = quote.mode ? MODE_META[quote.mode] : null;
  const ModeIcon = mode?.Icon;
  const origin = laneEndpoint(quote.origin_port, quote.origin_city);
  const dest = laneEndpoint(quote.destination_port, quote.destination_city);
  const companyName = quote.company?.name ?? "Unknown company";

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap">
        <button
          type="button"
          onClick={onOpen}
          className="text-[12.5px] font-semibold text-blue-700 hover:underline"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {quote.quote_number}
        </button>
      </td>
      <td className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-md bg-slate-100 grid place-items-center text-[11px] font-bold text-slate-600 flex-shrink-0"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {initialsFor(quote.company?.name)}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-900 truncate max-w-[180px]">
              {companyName}
            </div>
            {quote.company?.domain && (
              <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                {quote.company.domain}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap">
        {mode ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600">
            {ModeIcon && <ModeIcon className="w-3.5 h-3.5 text-slate-400" />}
            {mode.label}
          </span>
        ) : (
          <span className="text-slate-400 text-[12px]">—</span>
        )}
      </td>
      <td className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap">
        {origin || dest ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-600">
            <span>{origin ?? "—"}</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
            <span>{dest ?? "—"}</span>
          </span>
        ) : (
          <span className="text-slate-400 text-[12px]">—</span>
        )}
      </td>
      <td className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap">
        <QuoteStatusPill status={quote.status} />
      </td>
      <td
        className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap text-right text-[13px] font-semibold text-slate-900"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {money.format(quote.total_sell ?? 0)}
      </td>
      <td
        className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap text-right text-[12.5px] font-semibold text-emerald-700"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {money.format(quote.gross_profit ?? 0)}
      </td>
      <td
        className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap text-right text-[12.5px] font-semibold text-slate-600"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {formatMargin(quote.gross_margin_pct)}
      </td>
      <td className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap text-[13px] text-slate-700">
        {quote.owner_user_id ? "You" : "—"}
      </td>
      <td className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap text-[13px] text-slate-700">
        {formatValidUntil(quote.valid_until)}
      </td>
      <td className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap">
        <div className="flex gap-1 justify-end">
          <RowAction label="Open quote" onClick={onOpen}>
            <Eye className="w-3.5 h-3.5" />
          </RowAction>
          {/* Duplicate + Send wired in later tasks (Task 8/9). */}
          <RowAction label="Duplicate quote">
            <Copy className="w-3.5 h-3.5" />
          </RowAction>
          <RowAction label="Send quote">
            <Send className="w-3.5 h-3.5" />
          </RowAction>
        </div>
      </td>
    </tr>
  );
}

function RowAction({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="w-10 h-10 sm:w-8 sm:h-8 rounded-md border border-slate-200 bg-white grid place-items-center text-slate-500 transition hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50"
    >
      {children}
    </button>
  );
}

function QuotesSkeleton() {
  return (
    <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading quotes">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-lg bg-slate-100 animate-pulse"
          style={{ opacity: 1 - i * 0.08 }}
        />
      ))}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14">
      <div className="w-12 h-12 rounded-xl bg-slate-100 grid place-items-center mb-4">
        <FileText className="w-6 h-6 text-slate-400" />
      </div>
      <div
        className="text-[15px] font-bold text-slate-900"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        No quotes yet
      </div>
      <p className="text-[13px] text-slate-500 mt-1 max-w-sm">
        Create your first quote to start pricing, sending, and tracking revenue.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-5 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[10px] text-[13.5px] font-semibold text-white transition hover:brightness-105"
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          background: "linear-gradient(180deg,#2563eb,#1d4ed8)",
          boxShadow:
            "0 6px 16px rgba(37,99,235,.28), inset 0 1px 0 rgba(255,255,255,.18)",
        }}
      >
        <Plus className="w-4 h-4" />
        New Quote
      </button>
    </div>
  );
}
