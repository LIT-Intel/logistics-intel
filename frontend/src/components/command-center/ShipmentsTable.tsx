import { useEffect, useMemo, useState } from "react";

type ShipmentRow = {
  id?: string | number;
  mode?: "OCEAN" | "AIR" | string | null;
  depart_date?: string | null;
  arrival_date?: string | null;
  hs_codes?: string[] | null;
  origin_country?: string | null;
  dest_country?: string | null;
  weight_kg?: number | null;
  cbm?: number | null;
  carrier?: string | null;
  port_origin?: string | null;
  port_dest?: string | null;
};

export default function ShipmentsTable() {
  const [rows, setRows] = useState<ShipmentRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const company = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("lit:selectedCompany") || "null"); } catch { return null; }
  }, []);

  useEffect(() => {
    const company_id = company?.company_id ?? null;
    if (!company_id) { setRows([]); return; }
    (async () => {
      setLoading(true); setErr(null);
      try {
        // proxy → gateway → search-unified (GET)
        const params = new URLSearchParams({ company_id: String(company_id), limit: String(25), offset: String(0) });
        const r = await fetch(`/api/lit/public/getCompanyShipments?${params.toString()}`, {
          method: "GET",
          headers: { "accept": "application/json" }
        });
        if (!r.ok) throw new Error(String(r.status));
        const data = await r.json();
        setRows(data?.rows || []);
      } catch (e:any) {
        setErr(e?.message || "Failed to load shipments");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!company?.company_id) {
    return <div className="text-sm text-gray-500">Select or add a company to view shipments.</div>;
  }
  if (loading) return <div className="text-sm text-gray-500">Loading shipments…</div>;
  if (err) return <div className="text-sm text-red-600">Error: {err}</div>;
  if (!rows?.length) return <div className="text-sm text-gray-500">No shipments found.</div>;

  return (
    <div className="overflow-auto rounded-xl border">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <Th>Mode</Th>
            <Th>Depart</Th>
            <Th>Arrive</Th>
            <Th>Origin → Dest</Th>
            <Th>Carrier</Th>
            <Th>HS</Th>
            <Th>Weight (kg)</Th>
            <Th>CBM</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="hover:bg-slate-50">
              <Td>{r.mode ?? "—"}</Td>
              <Td>{fmtDate(r.depart_date)}</Td>
              <Td>{fmtDate(r.arrival_date)}</Td>
              <Td>{r.origin_country ?? "—"} → {r.dest_country ?? "—"}</Td>
              <Td>{r.carrier ?? "—"}</Td>
              <Td>{r.hs_codes?.slice(0,3).join(", ") || "—"}</Td>
              <Td>{num(r.weight_kg)}</Td>
              <Td>{num(r.cbm)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}
function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(+d) ? "—" : d.toISOString().slice(0,10);
}
function num(n?: number | null) {
  return n == null ? "—" : new Intl.NumberFormat().format(n);
}
