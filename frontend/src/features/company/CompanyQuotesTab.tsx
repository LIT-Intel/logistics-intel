/**
 * CompanyQuotesTab — the "Quotes" panel on the Company Profile (V2).
 *
 * Renders a company-scoped quoting view: a 6-card KPI row fed by
 * `quoting.companyMetrics(companyId)`, followed by a quotes table fed by
 * `quoting.list({ company_id })`. Visual language mirrors
 * `frontend/src/features/quoting/QuotingDashboard.tsx` (same raw-table
 * classes, same EnhancedKpiCard + LitSectionCard wrappers) so the panel
 * reads as a coherent slice of the standalone Quoting dashboard.
 *
 * Honest data only: loading shows a skeleton, empty shows a real empty
 * state, and zero rows are never faked. Row actions (Duplicate, Mark
 * Won/Lost) mutate via the quoting edge functions and invalidate both the
 * company metrics and the company-scoped list query on success.
 */
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FilePenLine,
  Send,
  BadgeCheck,
  CircleDollarSign,
  TrendingDown,
  Percent,
  Ship,
  Plane,
  Truck,
  Container,
  ArrowRight,
  Eye,
  Copy,
  CheckCircle2,
  XCircle,
  FileDown,
  Plus,
  FileText,
} from "lucide-react";

import { quoting } from "@/api/quoting";
import type { QuoteListItem, QuoteMode, QuoteCreateInput } from "@/api/quoting";
import EnhancedKpiCard from "@/components/dashboard/EnhancedKpiCard";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { QuoteStatusPill } from "@/features/quoting/components/QuoteStatusPill";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const MODE_META: Record<QuoteMode, { Icon: typeof Ship; label: string }> = {
  ocean: { Icon: Ship, label: "Ocean" },
  air: { Icon: Plane, label: "Air" },
  drayage: { Icon: Container, label: "Drayage" },
  ftl: { Icon: Truck, label: "FTL" },
  ltl: { Icon: Truck, label: "LTL" },
};

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

export default function CompanyQuotesTab({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const metricsKey = ["quoting", "companyMetrics", companyId];
  const listKey = ["quoting", "list", "company", companyId];

  const metricsQuery = useQuery({
    queryKey: metricsKey,
    queryFn: () => quoting.companyMetrics(companyId),
    enabled: !!companyId,
  });

  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () => quoting.list({ company_id: companyId }),
    enabled: !!companyId,
  });

  const metrics = metricsQuery.data?.data;
  const quotes: QuoteListItem[] = listQuery.data?.items ?? [];

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: metricsKey }),
      queryClient.invalidateQueries({ queryKey: listKey }),
    ]);
  }

  async function handleDuplicate(id: string) {
    try {
      const detail = await quoting.detail(id);
      const q = detail.data.quote;
      // Map only valid QuoteCreateInput fields off the source quote.
      const input: QuoteCreateInput = {
        company_id: companyId,
        contact_id: q.contact_id ?? undefined,
        owner_user_id: q.owner_user_id ?? undefined,
        mode: q.mode ?? undefined,
        service_type: q.service_type ?? undefined,
        incoterms: q.incoterms ?? undefined,
        origin_port: q.origin_port ?? undefined,
        destination_port: q.destination_port ?? undefined,
        origin_city: q.origin_city ?? undefined,
        origin_state: q.origin_state ?? undefined,
        origin_country: q.origin_country ?? undefined,
        origin_postal: q.origin_postal ?? undefined,
        destination_city: q.destination_city ?? undefined,
        destination_state: q.destination_state ?? undefined,
        destination_country: q.destination_country ?? undefined,
        destination_postal: q.destination_postal ?? undefined,
        distance_miles: q.distance_miles ?? undefined,
        equipment_type: q.equipment_type ?? undefined,
        container_count: q.container_count ?? undefined,
        weight_lbs: q.weight_lbs ?? undefined,
        commodity: q.commodity ?? undefined,
        hs_code: q.hs_code ?? undefined,
        cargo_value: q.cargo_value ?? undefined,
        currency: q.currency ?? undefined,
        fuel_surcharge_pct: q.fuel_surcharge_pct ?? undefined,
        notes: q.notes ?? undefined,
        terms_text: q.terms_text ?? undefined,
        valid_until: q.valid_until ?? undefined,
        line_items: detail.data.line_items,
      };
      const created = await quoting.create(input);
      await refreshAll();
      navigate(`/app/quoting/${created.data.quote.id}`);
    } catch (e) {
      console.error("[CompanyQuotesTab] duplicate failed", e);
    }
  }

  async function handleSetStatus(id: string, status: "closed_won" | "closed_lost") {
    try {
      await quoting.setStatus(id, status);
      await refreshAll();
    } catch (e) {
      console.error("[CompanyQuotesTab] status update failed", e);
    }
  }

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
      icon: TrendingDown,
      label: "Lost Revenue",
      value: money.format(metrics?.lost ?? 0),
      iconColor: "#e11d48",
    },
    {
      icon: Percent,
      label: "Win Rate",
      value: `${metrics?.win_rate ?? 0}%`,
      iconColor: "#7c3aed",
    },
  ];

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">
        <div>
          <h2
            className="text-[17px] sm:text-[19px] font-bold text-slate-900 tracking-[-0.3px]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Quotes
          </h2>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Priced, sent, and tracked revenue for this company.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/app/quoting/new?company_id=${companyId}`)}
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

      {/* KPI row — 2-up on mobile, 6-up at lg */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
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
        title="Company Quotes"
        sub={
          listQuery.isLoading
            ? "Loading…"
            : `${quotes.length} ${quotes.length === 1 ? "quote" : "quotes"}`
        }
        padded={false}
      >
        {listQuery.isLoading ? (
          <QuotesSkeleton />
        ) : quotes.length === 0 ? (
          <EmptyState
            onNew={() => navigate(`/app/quoting/new?company_id=${companyId}`)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#FAFBFC]">
                  <Th>Quote #</Th>
                  <Th>Lane</Th>
                  <Th>Mode</Th>
                  <Th>Status</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Gross Profit</Th>
                  <Th align="right">Margin</Th>
                  <Th>Valid Until</Th>
                  <Th>Owner</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <QuoteRow
                    key={q.id}
                    quote={q}
                    onOpen={() => navigate(`/app/quoting/${q.id}`)}
                    onDuplicate={() => handleDuplicate(q.id)}
                    onSend={() => navigate(`/app/quoting/${q.id}`)}
                    onMarkWon={() => handleSetStatus(q.id, "closed_won")}
                    onMarkLost={() => handleSetStatus(q.id, "closed_lost")}
                    onGeneratePdf={() => navigate(`/app/quoting/${q.id}`)}
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
  onDuplicate,
  onSend,
  onMarkWon,
  onMarkLost,
  onGeneratePdf,
}: {
  quote: QuoteListItem;
  onOpen: () => void;
  onDuplicate: () => void;
  onSend: () => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
  onGeneratePdf: () => void;
}) {
  const mode = quote.mode ? MODE_META[quote.mode] : null;
  const ModeIcon = mode?.Icon;
  const origin = laneEndpoint(quote.origin_port, quote.origin_city);
  const dest = laneEndpoint(quote.destination_port, quote.destination_city);

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
        {formatValidUntil(quote.valid_until)}
      </td>
      <td className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap text-[13px] text-slate-700">
        {quote.owner_user_id ? "You" : "—"}
      </td>
      <td className="px-3.5 py-3 border-b border-slate-50 whitespace-nowrap">
        <div className="flex gap-1 justify-end">
          <RowAction label="Open quote" onClick={onOpen}>
            <Eye className="w-3.5 h-3.5" />
          </RowAction>
          <RowAction label="Duplicate quote" onClick={onDuplicate}>
            <Copy className="w-3.5 h-3.5" />
          </RowAction>
          <RowAction label="Send quote" onClick={onSend}>
            <Send className="w-3.5 h-3.5" />
          </RowAction>
          <RowAction label="Mark won" onClick={onMarkWon}>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </RowAction>
          <RowAction label="Mark lost" onClick={onMarkLost}>
            <XCircle className="w-3.5 h-3.5" />
          </RowAction>
          <RowAction label="Generate PDF" onClick={onGeneratePdf}>
            <FileDown className="w-3.5 h-3.5" />
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
      {Array.from({ length: 5 }).map((_, i) => (
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
        No quotes for this company yet
      </div>
      <p className="text-[13px] text-slate-500 mt-1 max-w-sm">
        Create the first quote to start pricing, sending, and tracking revenue
        for this company.
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
