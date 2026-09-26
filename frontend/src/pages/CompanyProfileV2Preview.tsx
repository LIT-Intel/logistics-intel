/**
 * /preview/company-profile-v2 — PUBLIC design preview of Company Profile v2.
 *
 * No login: renders the real CompanyProfileWorkspace over a baked-in export
 * of Tesla's actual import BOLs (public U.S. CBP data, snapshot 2026-09-25).
 * Nothing here touches Supabase — the dataset ships in the bundle, so the
 * page works for anyone with the link. Owner-review surface only.
 */
import { useMemo, useState } from "react";
import { History, LayoutDashboard, Route } from "lucide-react";
import CompanyProfileWorkspace, {
  type WorkspaceTab,
} from "@/features/company-profile/CompanyProfileWorkspace";
import { normalizeUnifiedShipments } from "@/features/company-profile/data/normalizeShipments";
import { DEMO_TESLA_ROWS } from "@/features/company-profile/demo/demoTeslaRows";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO } from "@/features/company-profile/components/ui";

const PREVIEW_TABS: { id: WorkspaceTab; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "lanes", label: "Trade Lanes", Icon: Route },
  { id: "history", label: "Lane History", Icon: History },
];

export default function CompanyProfileV2Preview() {
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const dataset = useMemo(() => normalizeUnifiedShipments(DEMO_TESLA_ROWS), []);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Preview banner */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#1e293b] bg-[#0F172A] px-4 py-2.5 sm:px-8">
        <span
          className="rounded bg-[rgba(0,240,255,0.14)] px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#00F0FF]"
          style={{ fontFamily: FONT_MONO }}
        >
          Design preview
        </span>
        <span className="text-[12.5px] text-[#cbd5e1]" style={{ fontFamily: FONT_BODY }}>
          Company Profile v2 · real Tesla import BOLs (U.S. CBP), archive snapshot 2026-09-25 · read-only, no login
        </span>
      </div>

      {/* Identity + preview tab bar */}
      <div className="border-b border-[#E5E7EB] bg-white px-4 pt-5 sm:px-8">
        <div className="flex items-center gap-4">
          <div
            className="grid h-12 w-12 flex-none place-items-center rounded-[14px] bg-[#0F172A] text-[11px] font-bold tracking-[0.05em] text-white"
            style={{ fontFamily: FONT_DISPLAY, boxShadow: "0 12px 30px rgba(15,23,42,0.2)" }}
          >
            TSLA
          </div>
          <div className="min-w-0">
            <h1
              className="m-0 text-[28px] font-bold leading-[1.05] tracking-[-0.03em] text-[#0F172A] sm:text-[34px]"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              Tesla
            </h1>
            <div className="mt-0.5 text-[12.5px] text-[#64748b]" style={{ fontFamily: FONT_BODY }}>
              Receiver · Austin, TX · tesla.com
            </div>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Preview sections">
          {PREVIEW_TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className="flex items-center gap-1.5 whitespace-nowrap px-3.5 py-3 text-[14px] font-semibold transition-colors"
                style={{
                  fontFamily: FONT_DISPLAY,
                  color: active ? "#0F172A" : "#64748b",
                  boxShadow: active ? "inset 0 -2px 0 #3b82f6" : "inset 0 -2px 0 transparent",
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto max-w-[1560px] px-4 pb-16 pt-4 sm:px-8">
        <CompanyProfileWorkspace
          tab={tab}
          companyKey={null}
          companyName="Tesla"
          demoDataset={dataset}
          meta={{ hq: "Austin, TX", website: "tesla.com" }}
          savedContacts={0}
          onSwitchTab={(t) => {
            if (t === "lanes" || t === "history" || t === "overview") setTab(t as WorkspaceTab);
          }}
        />
      </div>
    </div>
  );
}
