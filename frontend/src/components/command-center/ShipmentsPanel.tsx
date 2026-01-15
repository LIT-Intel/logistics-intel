import React, { useEffect, useMemo, useState } from "react";
import { Ship, Package, Download, Filter, Calendar, MapPin } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Shipment {
  bol_number: string | null;
  shipped_on: string | null;
  origin: string | null;
  destination: string | null;
  origin_country: string | null;
  dest_city: string | null;
  dest_state: string | null;
  dest_zip: string | null;
  dest_country: string | null;
  teu?: number;
  hs_code: string | null;
  carrier: string | null;
}

export default function ShipmentsPanel() {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "ocean" | "air">("all");

  const [selectedRefresh, setSelectedRefresh] = useState(0);
  const selected = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("lit:selectedCompany") || "null");
    } catch {
      return null;
    }
  }, [selectedRefresh]);

  useEffect(() => {
    const handler = () => setSelectedRefresh(prev => prev + 1);
    window.addEventListener('storage', handler);
    const interval = setInterval(handler, 1000);
    return () => {
      window.removeEventListener('storage', handler);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const companyKey = selected?.company_id ?? selected?.source_company_key ?? null;
    if (!companyKey || !user) {
      setShipments([]);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.access_token) {
          throw new Error("Not authenticated");
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/importyeti-proxy`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.session.access_token}`,
            },
            body: JSON.stringify({
              action: "companyBols",
              company_id: companyKey,
              limit: 50,
              offset: 0,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to load shipments: ${response.status}`);
        }

        const result = await response.json();
        const rows = result.rows || result.data?.rows || [];
        setShipments(rows);
      } catch (err: any) {
        console.error("Shipments load error:", err);
        setError(err.message || "Failed to load shipments");
        setShipments([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, selected]);

  const filteredShipments = useMemo(() => {
    if (filterMode === "all") return shipments;
    return shipments.filter((s) => {
      if (filterMode === "ocean") return (s.teu ?? 0) > 0;
      if (filterMode === "air") return !s.teu || s.teu === 0;
      return true;
    });
  }, [shipments, filterMode]);

  const handleExportCsv = () => {
    if (!filteredShipments.length) return;

    const header = [
      "BOL Number",
      "Date",
      "Origin",
      "Destination",
      "TEU",
      "HS Code",
      "Carrier",
    ];
    const rows = filteredShipments.map((s) => [
      s.bol_number || "",
      s.shipped_on || "",
      s.origin || "",
      s.destination || "",
      s.teu?.toString() || "",
      s.hs_code || "",
      s.carrier || "",
    ]);

    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shipments.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
          <Ship className="w-6 h-6 text-red-600" />
        </div>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (filteredShipments.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Shipments Found</h3>
        <p className="text-sm text-slate-600">
          {shipments.length === 0
            ? "No shipment data available for this company"
            : "No shipments match your current filter"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              Shipments
              <Badge variant="secondary">{filteredShipments.length}</Badge>
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Bill of lading records from ImportYeti
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-1">
              <button
                onClick={() => setFilterMode("all")}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  filterMode === "all"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterMode("ocean")}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  filterMode === "ocean"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Ocean
              </button>
              <button
                onClick={() => setFilterMode("air")}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  filterMode === "air"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Air
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!filteredShipments.length}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left font-medium text-slate-700 pb-3 pr-4">Date</th>
                <th className="text-left font-medium text-slate-700 pb-3 pr-4">BOL</th>
                <th className="text-left font-medium text-slate-700 pb-3 pr-4">Origin</th>
                <th className="text-left font-medium text-slate-700 pb-3 pr-4">Destination</th>
                <th className="text-left font-medium text-slate-700 pb-3 pr-4">TEU</th>
                <th className="text-left font-medium text-slate-700 pb-3 pr-4">HS Code</th>
                <th className="text-left font-medium text-slate-700 pb-3">Carrier</th>
              </tr>
            </thead>
            <tbody>
              {filteredShipments.map((shipment, idx) => (
                <tr
                  key={shipment.bol_number || idx}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-3 pr-4 text-slate-900">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      {shipment.shipped_on
                        ? new Date(shipment.shipped_on).toLocaleDateString()
                        : "—"}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-700 font-mono text-xs">
                    {shipment.bol_number || "—"}
                  </td>
                  <td className="py-3 pr-4 text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>{shipment.origin || "—"}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>{shipment.destination || "—"}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    {shipment.teu ? (
                      <Badge variant="secondary" className="text-xs">
                        {shipment.teu} TEU
                      </Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-600 font-mono text-xs">
                    {shipment.hs_code || "—"}
                  </td>
                  <td className="py-3 text-slate-600">{shipment.carrier || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredShipments.length >= 50 && (
          <div className="mt-4 text-center text-xs text-slate-500">
            Showing first 50 shipments. Export CSV for full data.
          </div>
        )}
      </div>
    </div>
  );
}
