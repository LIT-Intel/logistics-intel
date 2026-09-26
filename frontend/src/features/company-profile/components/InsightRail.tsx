/**
 * InsightRail — README §5.6. Right 320px sticky column (parent grid supplies
 * the column): Trade profile (live, filtered, rows apply filters on click),
 * Account, Buying committee, Firmographics. Rows with no value are hidden;
 * cards with no rows are not rendered.
 */
import React from "react";
import { UserSearch } from "lucide-react";
import type { ProfileView } from "../data/selectors";
import { Card, EASE_OUT, FONT_BODY, FONT_DISPLAY, FONT_MONO, ModeledPill, Overline } from "./ui";

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function RailRow({
  k,
  v,
  onClick,
}: {
  k: string;
  v: React.ReactNode;
  onClick?: (() => void) | null;
}) {
  return (
    <div
      onClick={onClick ?? undefined}
      className={
        "flex justify-between gap-3 border-t border-[#F1F5F9] py-[9px] text-[13px]" +
        (onClick ? " cursor-pointer hover:text-blue-600" : "")
      }
      style={{ fontFamily: FONT_BODY }}
    >
      <span className="text-[#64748b]">{k}</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right font-semibold">
        {v}
      </span>
    </div>
  );
}

export interface InsightRailProps {
  view: ProfileView;
  account?: { ownerName?: string; stage?: string; lastActivity?: string; lists?: string };
  firmo?: { website?: string; phone?: string; hq?: string; parent?: string };
  savedContacts?: number;
  onFindContacts?: () => void;
}

export function InsightRail({ view, account, firmo, savedContacts = 0, onFindContacts }: InsightRailProps) {
  const lanes: any[] = Array.isArray(view.lanes) ? view.lanes : [];
  const carriers: any[] = Array.isArray(view.carriers) ? view.carriers : [];
  const suppliers: any[] = Array.isArray(view.suppliers) ? view.suppliers : [];
  const products: any[] = Array.isArray(view.products) ? view.products : [];
  const ctypes: any[] = Array.isArray(view.ctypes) ? view.ctypes : [];

  const has = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v !== "—";

  // ---- Card 1: Trade profile ----------------------------------------------
  const top = lanes[0];
  const car = carriers[0];
  const sup = suppliers[0];
  const prod = products[0];
  const eq = ctypes[0];
  const avgTeu = typeof view.S?.avgTeu === "number" ? view.S.avgTeu.toFixed(1) : null;
  const lastDate = view.story?.lastDate as string | undefined;

  const tradeRows: { k: string; v: React.ReactNode; onClick?: (() => void) | null }[] = [];
  if (top && has(top.label)) tradeRows.push({ k: "Top lane", v: top.label, onClick: top.onClick });
  if (car && has(car.label)) tradeRows.push({ k: "Top carrier", v: `${car.label} · ${car.share}`, onClick: car.onClick });
  if (sup && has(sup.label)) tradeRows.push({ k: "Top supplier", v: sup.label, onClick: sup.onClick });
  if (prod && has(prod.label)) tradeRows.push({ k: "Top product", v: prod.label, onClick: prod.onClick });
  if (eq && has(eq.label)) tradeRows.push({ k: "Dominant equipment", v: `${eq.label} · ${eq.share}`, onClick: eq.onClick });
  if (avgTeu != null)
    tradeRows.push({
      k: "Avg TEU / BOL",
      v: (
        <span className="inline-flex items-center gap-[6px]" style={TABULAR}>
          {avgTeu}
          {view.modeled?.teu && <ModeledPill />}
        </span>
      ),
    });
  if (has(lastDate)) tradeRows.push({ k: "Last arrival", v: <span style={TABULAR}>{lastDate}</span> });

  // ---- Card 2: Account -----------------------------------------------------
  const accountRows: React.ReactNode[] = [];
  if (has(account?.ownerName))
    accountRows.push(
      <div
        key="owner"
        className="flex justify-between gap-3 border-t border-[#F1F5F9] py-[9px] text-[13px]"
        style={{ fontFamily: FONT_BODY }}
      >
        <span className="text-[#64748b]">Owner</span>
        <span className="flex items-center gap-[6px] font-semibold">
          <span
            className="grid h-5 w-5 place-items-center rounded-full bg-[#3b82f6] text-[9px] font-semibold text-white"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            {initialsOf(account!.ownerName!)}
          </span>
          {account!.ownerName}
        </span>
      </div>,
    );
  if (has(account?.stage))
    accountRows.push(
      <div
        key="stage"
        className="flex justify-between gap-3 border-t border-[#F1F5F9] py-[9px] text-[13px]"
        style={{ fontFamily: FONT_BODY }}
      >
        <span className="text-[#64748b]">Stage</span>
        <span
          className="rounded-full px-[9px] py-[2px] text-[11px] font-semibold text-[#6d28d9]"
          style={{ fontFamily: FONT_BODY, background: "rgba(139,92,246,0.12)" }}
        >
          {account!.stage}
        </span>
      </div>,
    );
  if (has(account?.lastActivity)) accountRows.push(<RailRow key="la" k="Last activity" v={account!.lastActivity} />);
  if (has(account?.lists)) accountRows.push(<RailRow key="lists" k="Lists" v={account!.lists} />);

  // ---- Card 4: Firmographics -----------------------------------------------
  const firmoRows: React.ReactNode[] = [];
  if (has(firmo?.website)) {
    const href = /^https?:\/\//i.test(firmo!.website!) ? firmo!.website! : "https://" + firmo!.website!;
    firmoRows.push(
      <div
        key="web"
        className="flex justify-between gap-3 border-t border-[#F1F5F9] py-[9px] text-[13px]"
        style={{ fontFamily: FONT_BODY }}
      >
        <span className="text-[#64748b]">Website</span>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[#3b82f6] hover:text-[#2563eb]"
        >
          {firmo!.website}
        </a>
      </div>,
    );
  }
  if (has(firmo?.phone))
    firmoRows.push(
      <div
        key="phone"
        className="flex justify-between gap-3 border-t border-[#F1F5F9] py-[9px] text-[13px]"
        style={{ fontFamily: FONT_BODY }}
      >
        <span className="text-[#64748b]">Phone</span>
        <span className="text-[12px] font-medium" style={{ fontFamily: FONT_MONO, ...TABULAR }}>
          {firmo!.phone}
        </span>
      </div>,
    );
  if (has(firmo?.hq)) firmoRows.push(<RailRow key="hq" k="HQ" v={firmo!.hq} />);
  if (has(firmo?.parent)) firmoRows.push(<RailRow key="parent" k="Parent" v={firmo!.parent} />);

  return (
    <aside className="sticky top-[72px] flex min-w-0 flex-col gap-4">
      {/* Trade profile */}
      <Card style={{ padding: "18px 20px 10px" }}>
        <div className="mb-2 flex items-center justify-between">
          <Overline>Trade profile</Overline>
          <span
            className="rounded-[4px] px-[6px] py-[2px] text-[10px] font-medium text-[#1d4ed8]"
            style={{ fontFamily: FONT_MONO, background: "rgba(59,130,246,0.1)" }}
          >
            LIVE · FILTERED
          </span>
        </div>
        {tradeRows.map((r) => (
          <RailRow key={r.k} k={r.k} v={r.v} onClick={r.onClick} />
        ))}
      </Card>

      {/* Account */}
      {accountRows.length > 0 && (
        <Card style={{ padding: "18px 20px 10px" }}>
          <Overline className="mb-2">Account</Overline>
          {accountRows}
        </Card>
      )}

      {/* Buying committee */}
      <Card style={{ padding: "18px 20px" }}>
        <Overline className="mb-[10px]">Buying committee</Overline>
        {savedContacts > 0 ? (
          <div className="text-[13px] font-semibold text-[#0F172A]" style={{ fontFamily: FONT_BODY, ...TABULAR }}>
            {savedContacts.toLocaleString("en-US")} saved contacts
          </div>
        ) : (
          <div className="text-[13px] leading-normal text-[#475569]" style={{ fontFamily: FONT_BODY, lineHeight: 1.5 }}>
            No verified contacts saved. Find logistics, procurement and supply chain leads at this
            account.
          </div>
        )}
        <button
          type="button"
          onClick={onFindContacts}
          className="mt-[14px] flex h-[38px] w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-[#0F172A] text-[13px] font-semibold text-white hover:bg-[#1e293b] active:scale-[0.97]"
          style={{ fontFamily: FONT_BODY, transition: `transform 160ms ${EASE_OUT}` }}
        >
          <UserSearch size={15} />
          Find Contacts
        </button>
      </Card>

      {/* Firmographics */}
      {firmoRows.length > 0 && (
        <Card style={{ padding: "18px 20px 10px" }}>
          <Overline className="mb-2">Firmographics</Overline>
          {firmoRows}
        </Card>
      )}
    </aside>
  );
}
