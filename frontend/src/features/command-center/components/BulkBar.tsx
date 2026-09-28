/**
 * BulkBar — Command Center §4.5: fixed bottom-center dark bar that
 * slides in while rows are selected.
 *
 * Wired for real:
 *   - Add to Campaign → AddToCampaignModal (single company) or the
 *     inline bulk modal (attachCompaniesToCampaign accepts an id array).
 *   - Export CSV → client-side CSV of the selected row VMs (Blob).
 * Rendered disabled (no backend handler exists yet):
 *   - Assign owner · Remove · Verify emails.
 */
import { useEffect, useState } from "react";
import { Download, MailCheck, Send, Trash2, UserRoundCog, X } from "lucide-react";
import { toast } from "sonner";
import { attachCompaniesToCampaign, getCrmCampaigns } from "@/lib/api";
import AddToCampaignModal from "@/components/command-center/AddToCampaignModal";

const F_BODY = "'DM Sans',system-ui,sans-serif";
const F_MONO = "'JetBrains Mono',monospace";
const EASE = "cubic-bezier(0.16,1,0.3,1)";

// ---------------------------------------------------------------- CSV

const esc = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Build a CSV from the tab's row view-models (strings rendered verbatim). */
export function rowsToCsv(tab: "companies" | "contacts", rows: any[]): string {
  if (tab === "companies") {
    const head = [
      "Company",
      "City",
      "Owner",
      "Contacts",
      "Stage",
      "Last shipment",
      "Last shipment date",
      "Shipments 12M",
      "TEU 12M",
      "Est. spend 12M",
      "YoY",
      "Top lane",
      "Lane share",
      "Signal",
    ];
    const lines = rows.map((r) =>
      [
        r.name,
        r.city,
        r.ownerName,
        r.contactsLabel,
        r.stage,
        r.lastAgo,
        r.lastDate,
        r.ship,
        r.teu,
        r.spend,
        r.yoy,
        r.lane,
        r.laneShare,
        r.sig,
      ]
        .map(esc)
        .join(","),
    );
    return [head.join(","), ...lines].join("\r\n");
  }
  const head = [
    "Name",
    "Title",
    "Seniority",
    "Department",
    "Company",
    "Email",
    "Email status",
    "Phone",
    "LinkedIn",
    "Outbound Engine",
    "Campaign",
    "Last touch",
  ];
  const lines = rows.map((r) =>
    [
      r.name,
      r.title,
      r.sen,
      r.dept,
      r.co,
      r.email,
      r.emailState,
      r.chP !== "#E2E8F0" ? "yes" : "no",
      r.chL !== "#E2E8F0" ? "yes" : "no",
      r.campStatus,
      r.campName,
      r.touch,
    ]
      .map(esc)
      .join(","),
  );
  return [head.join(","), ...lines].join("\r\n");
}

export function downloadCsv(csv: string, filename: string): void {
  // ﻿ BOM so Excel opens the UTF-8 CSV correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -------------------------------------------------- bulk campaign modal

type Campaign = { id: string; name: string };

function BulkCampaignModal({
  open,
  onClose,
  companies,
}: {
  open: boolean;
  onClose: () => void;
  companies: { company_id: string | null; name: string }[];
}) {
  const [list, setList] = useState<Campaign[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const data = await getCrmCampaigns();
        const rows = Array.isArray((data as any)?.rows)
          ? ((data as any).rows as Campaign[])
          : Array.isArray(data)
            ? (data as Campaign[])
            : [];
        setList(rows);
      } catch (err) {
        console.error("Failed to load campaigns:", err);
        setList([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  async function add(campaignId: string) {
    const ids = companies.map((c) => c.company_id).filter(Boolean) as string[];
    if (!ids.length) {
      toast.error("No companies with a resolvable ID in the selection");
      return;
    }
    setAdding(campaignId);
    try {
      await attachCompaniesToCampaign(campaignId, ids);
      toast.success(`Added ${ids.length} ${ids.length === 1 ? "company" : "companies"} to campaign`);
      onClose();
      document.dispatchEvent(new Event("lit:campaign-kpi:refresh"));
    } catch (e: any) {
      toast.error(`Failed: ${e?.message || e}`);
    } finally {
      setAdding(null);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
      <div className="w-[600px] max-w-[95vw] rounded-2xl bg-white shadow-2xl border">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="text-sm font-semibold">
            Add to Campaign · {companies.length} {companies.length === 1 ? "company" : "companies"}
          </div>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 active:scale-[0.97] motion-reduce:active:scale-100"
          >
            Close
          </button>
        </div>
        <div className="p-5">
          {loading && <div className="text-sm text-gray-500">Loading…</div>}
          {!loading && !list?.length && <div className="text-sm text-gray-500">No campaigns found.</div>}
          <div className="space-y-2">
            {list?.map((c) => (
              <div key={c.id} className="rounded-xl border p-3 flex items-center justify-between">
                <div className="text-sm">{c.name}</div>
                <button
                  className="px-3 py-1.5 text-sm rounded-xl border disabled:cursor-wait disabled:opacity-60 active:scale-[0.97] motion-reduce:active:scale-100"
                  onClick={() => add(c.id)}
                  disabled={adding !== null}
                >
                  {adding === c.id ? "Adding…" : "Add"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bar

export interface BulkBarProps {
  tab: "companies" | "contacts";
  count: number;
  /** Distinct companies behind the selection (uuid + name), resolved by the parent. */
  companies: { company_id: string | null; name: string }[];
  /** Row VMs of the current selection (current tab) at click time. */
  getSelectedRows: () => any[];
  onClear: () => void;
  reduced?: boolean;
}

export default function BulkBar({
  tab,
  count,
  companies,
  getSelectedRows,
  onClear,
  reduced,
}: BulkBarProps) {
  const [modal, setModal] = useState<"single" | "bulk" | null>(null);

  // Keep the last non-zero count so the label doesn't flash "0" during
  // the slide-out.
  const [lastCount, setLastCount] = useState(count);
  useEffect(() => {
    if (count > 0) setLastCount(count);
  }, [count]);

  const exportCsv = () => {
    const rows = getSelectedRows();
    if (!rows.length) return;
    downloadCsv(rowsToCsv(tab, rows), `command-center-${tab}-selected.csv`);
  };

  const openCampaign = () => {
    if (!companies.length) {
      toast.error("Selection has no companies to add");
      return;
    }
    setModal(companies.length === 1 ? "single" : "bulk");
  };

  const ghost: React.CSSProperties = {
    height: 34,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 12px",
    borderRadius: 9,
    font: `600 12px ${F_BODY}`,
    cursor: "pointer",
    color: "#cbd5e1",
    whiteSpace: "nowrap",
    background: "transparent",
    border: "none",
    flex: "none",
  };
  const ghostDisabled: React.CSSProperties = {
    ...ghost,
    color: "#64748b",
    cursor: "not-allowed",
  };

  const disabledBtn = (label: string, Icon: typeof Download) => (
    <button type="button" disabled title="Coming soon" className="cc-bulkghost" style={ghostDisabled}>
      <Icon size={14} />
      <span className="cc-bulklabel">{label}</span>
    </button>
  );

  return (
    <>
      <div
        role="toolbar"
        aria-label="Bulk actions"
        aria-hidden={count === 0}
        style={{
          position: "fixed",
          left: "50%",
          bottom: 24,
          zIndex: 800,
          transform: `translate(-50%,${count > 0 ? "0" : "160%"})`,
          transition: reduced ? "none" : `transform 350ms ${EASE}`,
          display: "flex",
          alignItems: "center",
          flexWrap: "nowrap",
          gap: 6,
          padding: "8px 8px 8px 16px",
          background: "#0F172A",
          border: "1px solid #1e293b",
          borderRadius: 14,
          boxShadow: "0 20px 40px rgba(2,6,23,0.35)",
          color: "#f8fafc",
          maxWidth: "calc(100vw - 16px)",
          overflowX: "auto",
          fontFamily: F_BODY,
        }}
      >
        <span style={{ font: `600 13px ${F_BODY}`, marginRight: 8, whiteSpace: "nowrap", flex: "none" }}>
          <span style={{ fontFamily: F_MONO, color: "#00F0FF", fontVariantNumeric: "tabular-nums" }}>
            {count > 0 ? count : lastCount}
          </span>{" "}
          selected
        </span>

        <button
          type="button"
          className="cc-press cc-focus"
          onClick={openCampaign}
          style={{
            height: 34,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px",
            borderRadius: 9,
            background: "#3b82f6",
            border: "none",
            color: "#fff",
            font: `600 12px ${F_BODY}`,
            cursor: "pointer",
            whiteSpace: "nowrap",
            boxShadow: "0 0 14px rgba(59,130,246,0.45)",
            flex: "none",
          }}
        >
          <Send size={14} />
          Add to Campaign
        </button>

        {tab === "companies" ? (
          <>
            {disabledBtn("Assign owner", UserRoundCog)}
            <button type="button" className="cc-bulkghost cc-focus" onClick={exportCsv} style={ghost}>
              <Download size={14} />
              <span className="cc-bulklabel">Export CSV</span>
            </button>
            {disabledBtn("Remove", Trash2)}
          </>
        ) : (
          <>
            {disabledBtn("Verify emails", MailCheck)}
            <button type="button" className="cc-bulkghost cc-focus" onClick={exportCsv} style={ghost}>
              <Download size={14} />
              <span className="cc-bulklabel">Export CSV</span>
            </button>
          </>
        )}

        <button
          type="button"
          aria-label="Clear selection"
          className="cc-bulkghost cc-focus"
          onClick={onClear}
          style={{ ...ghost, width: 34, padding: 0, justifyContent: "center", color: "#94a3b8" }}
        >
          <X size={15} />
        </button>
      </div>

      {/* zIndex wrapper: the modals' own z-50 would sit under the 800 bar */}
      <div style={{ position: "relative", zIndex: 1000 }}>
        <AddToCampaignModal
          open={modal === "single"}
          onClose={() => setModal(null)}
          company={companies[0] ?? { company_id: null, name: "" }}
        />
        <BulkCampaignModal open={modal === "bulk"} onClose={() => setModal(null)} companies={companies} />
      </div>
    </>
  );
}
