// Shared BOL preview table — extracted from CDPSupplyChain so Pulse LIVE
// can render BOL rows with the same look-and-feel as the Supply Chain
// shipments tab.
//
// The default column set (Date / Lane / Carrier / Supplier / Container /
// TEU / FCL/LCL / HS) reproduces the historical CDPSupplyChain rendering
// 1:1. Additional optional columns (`final_dest`, `arrival`,
// `container_type`, `consignee`, `cost`, `service`) are available for
// Pulse LIVE digest cards.

import { useState } from "react";
import { Info, Copy, Check } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import LitPill from "@/components/ui/LitPill";
import {
  formatBolDate,
  getBolCarrierString,
  getBolDestination,
  getBolHs,
  getBolOrigin,
  getBolSupplier,
  parseBolDate,
  getBolDate,
  readCarrier,
} from "@/lib/bols/helpers";

export type BolColumn =
  | "date"
  | "bol_number"
  | "service"
  | "lane"
  | "carrier"
  | "supplier"
  | "container"
  | "container_type"
  | "teu"
  | "fcl_lcl"
  | "hs"
  | "final_dest"
  | "arrival"
  | "consignee"
  | "cost";

export interface BolPreviewTableProps {
  bols: any[];
  columns?: BolColumn[];
  emptyMessage?: string;
  /**
   * Optional wrapper config. When omitted, the table is rendered inside
   * a LitSectionCard sized like the CDP Supply Chain "Recent BOLs"
   * panel. Pass `wrapper: false` to render only the bare <table>.
   */
  title?: string;
  sub?: string;
  wrapper?: boolean;
}

const DEFAULT_COLUMNS: BolColumn[] = [
  "date",
  "lane",
  "carrier",
  "supplier",
  "container",
  "teu",
  "fcl_lcl",
  "hs",
];

const COLUMN_LABEL: Record<BolColumn, string> = {
  date: "Date",
  bol_number: "BOL #",
  service: "Service",
  lane: "Lane",
  carrier: "Carrier",
  supplier: "Supplier",
  container: "Container",
  container_type: "Type",
  teu: "TEU",
  fcl_lcl: "FCL/LCL",
  hs: "HS",
  final_dest: "Final Dest",
  arrival: "Arrival",
  consignee: "Consignee",
  cost: "Cost",
};

export function BolPreviewTable({
  bols,
  columns = DEFAULT_COLUMNS,
  emptyMessage,
  title = "Recent BOLs",
  sub,
  wrapper = true,
}: BolPreviewTableProps) {
  const cols = columns.length ? columns : DEFAULT_COLUMNS;
  const isEmpty = !bols || bols.length === 0;
  const inner = (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#FAFBFC]">
            {cols.map((c) => (
              <th
                key={c}
                className="font-display whitespace-nowrap border-b border-slate-100 px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
              >
                {COLUMN_LABEL[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bols.map((bol, i, arr) => (
            <BolPreviewRow
              key={i}
              bol={bol}
              columns={cols}
              isLast={i === arr.length - 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!wrapper) {
    if (isEmpty) {
      return (
        <div className="px-3 py-4 text-[11px] text-slate-400">
          {emptyMessage || "No BOL records to display."}
        </div>
      );
    }
    return inner;
  }

  const subLabel =
    sub ??
    (isEmpty
      ? undefined
      : `${bols.length} latest records · expand to see HS / weight / quantity`);

  if (isEmpty) {
    return (
      <LitSectionCard title={title} sub={subLabel}>
        <div className="px-1 py-2 text-[11px] text-slate-400">
          {emptyMessage || "No BOL records to display."}
        </div>
      </LitSectionCard>
    );
  }

  return (
    <LitSectionCard title={title} sub={subLabel} padded={false}>
      {inner}
    </LitSectionCard>
  );
}

export function BolPreviewRow({
  bol,
  columns,
  isLast,
}: {
  bol: any;
  columns: BolColumn[];
  isLast?: boolean;
}) {
  // Phase 6 — broad BOL helpers; the row never renders "Invalid Date" /
  // empty lane / blank carrier when ANY of the multi-name fields are
  // present in the raw row.
  const carrierMeta = readCarrier(bol);
  const carrierName =
    carrierMeta?.name ||
    (() => {
      const s = getBolCarrierString(bol);
      return s === "—" ? null : s;
    })();
  const supplier = (() => {
    const s = getBolSupplier(bol);
    return s === "—" ? null : s;
  })();
  const teu = Number(bol?.teu) || Number(bol?.containers_teu) || null;
  const isLcl =
    Boolean(bol?.lcl) ||
    /lcl/i.test(String(bol?.mode || bol?.fcl_lcl || bol?.loadType || ""));
  const fclLcl = isLcl ? "LCL" : "FCL";
  const containerCount =
    Number(bol?.containers_count) ||
    Number(bol?.containersCount) ||
    Number(bol?.container_count) ||
    null;
  const containerType =
    bol?.container_type ||
    bol?.containerType ||
    bol?.raw?.container_group ||
    null;
  const hs = (() => {
    const s = getBolHs(bol);
    return s === "—" ? null : s;
  })();
  const origin = (() => {
    const s = getBolOrigin(bol);
    return s === "—" ? null : s;
  })();
  const destination = (() => {
    const s = getBolDestination(bol);
    return s === "—" ? null : s;
  })();
  const destCity = bol?.dest_city || null;
  const destState = bol?.dest_state || null;
  const destZip = bol?.dest_zip || null;
  const finalDestParsed = (() => {
    if (destCity && destState && destZip) return `${destCity}, ${destState} ${destZip}`;
    if (destCity && destState) return `${destCity}, ${destState}`;
    if (destCity) return destCity;
    return null;
  })();
  const finalDest =
    finalDestParsed ||
    bol?.final_destination ||
    bol?.finalDestination ||
    bol?.place_of_delivery ||
    bol?.placeOfDelivery ||
    bol?.raw?.place_of_delivery ||
    null;
  const bolNumber =
    bol?.bol_number ||
    bol?.bolNumber ||
    bol?.Bill_of_Lading ||
    bol?.house_bill_of_lading ||
    bol?.houseBillOfLading ||
    bol?.raw?.house_bill_of_lading ||
    null;
  const arrival = (() => {
    const value =
      bol?.arrival_date ||
      bol?.arrivalDate ||
      bol?.Arrival_Date ||
      bol?.raw?.arrival_date ||
      null;
    const d = parseBolDate(value);
    if (!d) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  })();
  const consignee =
    bol?.consigneeName ||
    bol?.consignee_name ||
    (typeof bol?.consignee === "string" ? bol.consignee : null) ||
    bol?.raw?.consignee_name ||
    null;
  const cost = (() => {
    const v =
      bol?.estimated_cost ||
      bol?.estimatedCost ||
      bol?.value ||
      bol?.declared_value ||
      bol?.declaredValue ||
      null;
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return `$${Math.round(n).toLocaleString()}`;
  })();
  const service = (() => {
    const v =
      bol?.service ||
      bol?.service_type ||
      bol?.serviceType ||
      bol?.mode ||
      bol?.raw?.service ||
      null;
    if (!v || String(v).trim() === "—" || !String(v).trim()) return null;
    return String(v);
  })();

  const renderCell = (col: BolColumn) => {
    switch (col) {
      case "date":
        return (
          <td
            key={col}
            className="font-mono whitespace-nowrap px-3 py-2 text-[10px] text-slate-600"
          >
            {formatBolDate(bol)}
          </td>
        );
      case "service":
        return (
          <td key={col} className="px-3 py-2">
            <span className="font-display text-[11px] text-slate-700">
              {service || <span className="text-slate-300">—</span>}
            </span>
          </td>
        );
      case "bol_number":
        return (
          <td key={col} className="px-3 py-2">
            {bolNumber ? (
              <BolNumberCell value={String(bolNumber)} />
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </td>
        );
      case "lane":
        return (
          <td key={col} className="px-3 py-2">
            <span className="font-display whitespace-nowrap text-[11px] text-slate-700">
              {origin || <span className="text-slate-300">—</span>}{" "}
              <span className="text-slate-300">→</span>{" "}
              {destination || <span className="text-slate-300">—</span>}
            </span>
          </td>
        );
      case "carrier":
        return (
          <td key={col} className="px-3 py-2">
            {carrierName ? (
              <span className="inline-flex items-center gap-1">
                <span className="font-display text-[11px] font-semibold text-slate-900">
                  {carrierName}
                </span>
                {carrierMeta?.inferred && (
                  <span title="Inferred from Master Bill prefix">
                    <LitPill tone="amber" icon={<Info className="h-2 w-2" />}>
                      MBL
                    </LitPill>
                  </span>
                )}
              </span>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </td>
        );
      case "supplier":
        return (
          <td
            key={col}
            className="font-body truncate px-3 py-2 text-[11px] text-slate-600"
          >
            {supplier || <span className="text-slate-300">—</span>}
          </td>
        );
      case "container":
        return (
          <td key={col} className="px-3 py-2">
            <span className="font-mono whitespace-nowrap text-[10px] text-slate-700">
              {containerCount != null ? containerCount.toString() : "—"}
              {containerType ? (
                <span className="text-slate-400"> · {containerType}</span>
              ) : null}
            </span>
          </td>
        );
      case "container_type": {
        // Inline pill rendering like "3 × 40HC"
        const pillLabel =
          containerCount != null && containerType
            ? `${containerCount} × ${containerType}`
            : containerType
            ? String(containerType)
            : containerCount != null
            ? `${containerCount}`
            : null;
        return (
          <td key={col} className="px-3 py-2">
            {pillLabel ? (
              <LitPill tone="slate">{pillLabel}</LitPill>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </td>
        );
      }
      case "teu":
        return (
          <td
            key={col}
            className="font-mono px-3 py-2 text-[11px] font-semibold text-slate-900"
          >
            {teu != null ? Number(teu).toFixed(1) : "—"}
          </td>
        );
      case "fcl_lcl":
        return (
          <td key={col} className="px-3 py-2">
            <LitPill tone={isLcl ? "purple" : "blue"}>{fclLcl}</LitPill>
          </td>
        );
      case "hs":
        return (
          <td
            key={col}
            className="font-mono px-3 py-2 text-[10px] text-slate-500"
          >
            {hs || <span className="text-slate-300">—</span>}
          </td>
        );
      case "final_dest":
        return (
          <td key={col} className="px-3 py-2">
            <span className="font-display whitespace-nowrap text-[11px] text-slate-700">
              {finalDest || <span className="text-slate-300">—</span>}
            </span>
          </td>
        );
      case "arrival":
        return (
          <td
            key={col}
            className="font-mono whitespace-nowrap px-3 py-2 text-[10px] text-slate-600"
          >
            {arrival || <span className="text-slate-300">—</span>}
          </td>
        );
      case "consignee":
        return (
          <td
            key={col}
            className="font-body truncate px-3 py-2 text-[11px] text-slate-600"
          >
            {consignee || <span className="text-slate-300">—</span>}
          </td>
        );
      case "cost":
        return (
          <td
            key={col}
            className="font-mono whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-slate-900"
          >
            {cost || <span className="text-slate-300">—</span>}
          </td>
        );
      default:
        return <td key={col} className="px-3 py-2" />;
    }
  };

  return (
    <tr
      className={[
        "hover:bg-slate-50/60",
        !isLast ? "border-b border-slate-100" : "",
      ].join(" ")}
    >
      {columns.map(renderCell)}
    </tr>
  );
}

function BolNumberCell({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore clipboard errors
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-[10px] font-semibold tracking-tight text-slate-800">
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? "Copied!" : "Copy BOL #"}
        className="inline-flex h-4 w-4 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        {copied ? (
          <Check className="h-2.5 w-2.5 text-emerald-600" />
        ) : (
          <Copy className="h-2.5 w-2.5" />
        )}
      </button>
      {copied && (
        <span className="text-[9px] font-semibold text-emerald-600">
          Copied!
        </span>
      )}
    </span>
  );
}

// Re-export the helpers so callers can import them from a single module
// when convenient.
export {
  formatBolDate,
  getBolCarrierString,
  getBolDate,
  getBolDestination,
  getBolHs,
  getBolOrigin,
  getBolSupplier,
  parseBolDate,
  readCarrier,
} from "@/lib/bols/helpers";

export default BolPreviewTable;
