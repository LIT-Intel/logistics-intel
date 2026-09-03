/**
 * CompanyCrmPanel — the "CRM / Revenue" 360 summary on the Company Profile.
 *
 * This is the hub that ties a single company's lifecycle state together on
 * the profile page: its Deals, Quotes, open Tasks (Part A) plus Campaign
 * membership, an Email/Conversations line, and quick actions (Part B). Every
 * number is real and org-scoped (RLS on the underlying tables) via
 * `@/api/companyCrm`; honest zeros, no fabrication. A single provider hiccup
 * fails soft to an empty section rather than blanking the whole panel.
 *
 * Deal rows are clickable and open the existing DealDetailDrawer in-place
 * (the profile owns the `stages` + drawer render). When there are no deals we
 * fall back to the profile's existing "Add to pipeline" CTA (passed in as
 * `onAddToPipeline`) so the panel never dead-ends.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  FileText,
  CheckSquare,
  Megaphone,
  Mail,
  Plus,
  Loader2,
  ArrowRight,
  UserPlus,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  loadCompanyCrmSummary,
  type CompanyCrmSummary,
  type CompanyIdentity,
} from "@/api/companyCrm";
import type { DealCard, DealStage } from "@/api/crm";

const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtMoney(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return "—";
  return money.format(v);
}

function fmtDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  closed_won: "Won",
  closed_lost: "Lost",
  rejected: "Rejected",
  expired: "Expired",
};

export type CompanyCrmPanelProps = {
  identity: CompanyIdentity;
  /** Org's pipeline stages — used to open DealDetailDrawer for a deal row. */
  stages: DealStage[];
  /** Open the DealDetailDrawer for a specific deal (profile owns the render). */
  onOpenDeal: (deal: DealCard) => void;
  /** Fallback CTA when the company has no deals yet. */
  onAddToPipeline: () => void;
  /** Whether the "Add to pipeline" affordance is available (pipeline exists). */
  canAddToPipeline: boolean;
  /** Jump to the profile's Quotes tab. */
  onOpenQuotesTab: () => void;
  /** Jump to the profile's Inbox tab. */
  onOpenInboxTab: () => void;
  /** Jump to the profile's Contacts tab (enrich). */
  onOpenContactsTab: () => void;
  /** Open the Add-to-campaign / Start-outreach modal. */
  onStartOutreach: () => void;
  /** Deep-link an existing campaign this company's contacts belong to. */
  onOpenCampaign: (campaignId: string) => void;
  /** Deep-link a single quote (id). */
  onOpenQuote: (quoteId: string) => void;
  /** Start a new quote for this company. */
  onNewQuote: () => void;
  /** Start a multi-lane RFP for this company. */
  onNewRfp?: () => void;
  /** Bump when a deal changes so the panel refetches. */
  refreshKey?: number;
};

export default function CompanyCrmPanel(props: CompanyCrmPanelProps) {
  const {
    identity,
    onOpenDeal,
    onAddToPipeline,
    canAddToPipeline,
    onOpenQuotesTab,
    onOpenInboxTab,
    onOpenContactsTab,
    onStartOutreach,
    onOpenCampaign,
    onOpenQuote,
    onNewQuote,
    onNewRfp,
    refreshKey,
  } = props;

  const [data, setData] = useState<CompanyCrmSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // Collapsed by default (owner request) — the header invites the user to
  // open it; state persists per browser so a user who likes it open stays open.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("lit:crmPanelOpen") !== "1";
    } catch {
      return true;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("lit:crmPanelOpen", next ? "0" : "1");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Stable identity key so the effect only refires on a real identity change.
  const identKey = useMemo(
    () =>
      [
        identity.companyUuid,
        identity.savedCompanyId,
        identity.sourceCompanyKey,
      ]
        .map((v) => v ?? "")
        .join("|"),
    [identity.companyUuid, identity.savedCompanyId, identity.sourceCompanyKey],
  );

  const load = useCallback(async () => {
    const summary = await loadCompanyCrmSummary(identity).catch(() => null);
    return summary;
  }, [identKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const summary = await load();
      if (!alive) return;
      setData(summary);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [load, refreshKey]);

  // Nothing to key off of — never render (profile still has its own CTA).
  const hasIdentity =
    !!identity.companyUuid ||
    !!identity.savedCompanyId ||
    !!identity.sourceCompanyKey;
  if (!hasIdentity) return null;

  const deals = data?.deals ?? [];
  const quotes = data?.quotes;
  const tasks = data?.tasks;
  const campaigns = data?.campaigns;
  const email = data?.email;

  const openDealValue = deals
    .filter((d) => !/(won|lost)/i.test(String(d.stage_id ?? "")))
    .reduce((s, d) => s + (Number(d.value_amount) || 0), 0);

  return (
    <div className="px-4 pt-3 md:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Header — click to expand/collapse (collapsed by default) */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50/60 ${
            collapsed ? "rounded-2xl" : "rounded-t-2xl border-b border-slate-100"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
              <Briefcase className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <div
                className="text-[13px] font-bold text-slate-900"
                style={{ fontFamily: FONT_HEAD }}
              >
                CRM / Revenue
              </div>
              <div
                className="text-[11px] text-slate-400"
                style={{ fontFamily: FONT_BODY }}
              >
                {collapsed
                  ? "Deals, quotes, tasks & outreach — click to open"
                  : "This company across your workspace"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loading && !collapsed ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
            ) : null}
            {collapsed ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </button>

        {!collapsed && (
          <>
        {/* Body grid */}
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-2xl bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
          {/* Deals */}
          <Cell>
            <CellHead
              Icon={Briefcase}
              label="Deals"
              tint="text-indigo-600"
              value={deals.length ? String(deals.length) : "0"}
              sub={
                openDealValue > 0 ? `${fmtMoney(openDealValue)} open` : null
              }
            />
            {deals.length === 0 ? (
              <button
                type="button"
                onClick={onAddToPipeline}
                disabled={!canAddToPipeline}
                className="mt-1 inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11.5px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ fontFamily: FONT_HEAD }}
              >
                <Plus className="h-3 w-3" />
                Add to pipeline
              </button>
            ) : (
              <div className="mt-1 flex flex-col gap-1">
                {deals.slice(0, 3).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onOpenDeal(d)}
                    className="group flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700 group-hover:text-slate-900">
                      {d.title}
                    </span>
                    <span className="shrink-0 text-[11.5px] font-semibold text-slate-500">
                      {fmtMoney(d.value_amount)}
                    </span>
                  </button>
                ))}
                {deals.length > 3 ? (
                  <span className="px-1.5 text-[11px] text-slate-400">
                    +{deals.length - 3} more
                  </span>
                ) : null}
              </div>
            )}
          </Cell>

          {/* Quotes */}
          <Cell>
            <CellHead
              Icon={FileText}
              label="Quotes"
              tint="text-blue-600"
              value={quotes ? String(quotes.count) : "0"}
              sub={
                quotes && quotes.wonValue > 0
                  ? `${fmtMoney(quotes.wonValue)} won`
                  : quotes && quotes.openValue > 0
                    ? `${fmtMoney(quotes.openValue)} open`
                    : null
              }
            />
            {quotes && quotes.latest ? (
              <button
                type="button"
                onClick={() => onOpenQuote(quotes.latest!.id)}
                className="mt-1 flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700">
                  {quotes.latest.quote_number
                    ? `#${quotes.latest.quote_number}`
                    : "Latest quote"}
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-blue-600">
                  {QUOTE_STATUS_LABEL[String(quotes.latest.status)] ??
                    quotes.latest.status ??
                    "—"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onNewQuote}
                className="mt-1 inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11.5px] font-semibold text-blue-700 hover:bg-blue-100"
                style={{ fontFamily: FONT_HEAD }}
              >
                <Plus className="h-3 w-3" />
                New quote
              </button>
            )}
          </Cell>

          {/* Open tasks */}
          <Cell>
            <CellHead
              Icon={CheckSquare}
              label="Open tasks"
              tint="text-amber-600"
              value={tasks ? String(tasks.openCount) : "0"}
              sub={
                tasks?.nextDue
                  ? `Next due ${fmtDate(tasks.nextDue) ?? "—"}`
                  : null
              }
            />
            {tasks && tasks.openCount > 0 ? (
              <span className="mt-1 px-1.5 text-[11.5px] text-slate-500">
                {tasks.openCount} open across this account
              </span>
            ) : (
              <span className="mt-1 px-1.5 text-[11.5px] text-slate-400">
                No open tasks
              </span>
            )}
          </Cell>

          {/* Campaigns + Email (Part B) */}
          <Cell>
            <CellHead
              Icon={Megaphone}
              label="Outreach"
              tint="text-fuchsia-600"
              value={campaigns ? String(campaigns.campaignCount) : "0"}
              sub={
                campaigns && campaigns.contactCount > 0
                  ? `${campaigns.contactCount} contact${campaigns.contactCount === 1 ? "" : "s"}`
                  : null
              }
            />
            {campaigns && campaigns.campaigns.length > 0 ? (
              <button
                type="button"
                onClick={() => onOpenCampaign(campaigns.campaigns[0].id)}
                className="mt-1 flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700">
                  {campaigns.campaigns[0].name ?? "Campaign"}
                </span>
                {campaigns.campaigns[0].status ? (
                  <span className="shrink-0 text-[11px] font-semibold text-fuchsia-600">
                    {campaigns.campaigns[0].status}
                  </span>
                ) : null}
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartOutreach}
                className="mt-1 inline-flex items-center gap-1 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2 py-1 text-[11.5px] font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
                style={{ fontFamily: FONT_HEAD }}
              >
                <Send className="h-3 w-3" />
                Start outreach
              </button>
            )}
            {/* Email / conversations line */}
            <button
              type="button"
              onClick={onOpenInboxTab}
              className="mt-2 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50"
            >
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[11.5px] font-medium text-slate-600">
                {email && email.threadCount > 0
                  ? `${email.threadCount} thread${email.threadCount === 1 ? "" : "s"}${
                      email.unreadCount > 0 ? ` · ${email.unreadCount} unread` : ""
                    }`
                  : "No email yet"}
              </span>
              <ArrowRight className="h-3 w-3 text-slate-300" />
            </button>
          </Cell>
        </div>

        {/* Quick actions (Part B) */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
          <QuickAction
            Icon={Send}
            label="Add to campaign"
            onClick={onStartOutreach}
          />
          <QuickAction Icon={FileText} label="New quote" onClick={onNewQuote} />
          {onNewRfp && <QuickAction Icon={FileText} label="New RFP" onClick={onNewRfp} />}
          <QuickAction
            Icon={UserPlus}
            label="Enrich contacts"
            onClick={onOpenContactsTab}
          />
          <button
            type="button"
            onClick={onOpenQuotesTab}
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-slate-500 hover:text-slate-700"
            style={{ fontFamily: FONT_HEAD }}
          >
            View quotes
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-white px-3.5 py-3">{children}</div>
  );
}

function CellHead({
  Icon,
  label,
  value,
  sub,
  tint,
}: {
  Icon: typeof Briefcase;
  label: string;
  value: string;
  sub: string | null;
  tint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${tint}`} />
        <span
          className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400"
          style={{ fontFamily: FONT_HEAD }}
        >
          {label}
        </span>
      </div>
      <div className="text-right">
        <div
          className="text-[17px] font-bold leading-none text-slate-900"
          style={{ fontFamily: FONT_HEAD }}
        >
          {value}
        </div>
        {sub ? (
          <div className="mt-0.5 text-[10.5px] font-medium text-slate-400">
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QuickAction({
  Icon,
  label,
  onClick,
}: {
  Icon: typeof Briefcase;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      style={{ fontFamily: FONT_HEAD }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
