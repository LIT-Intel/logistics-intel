import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Search } from "lucide-react";
import CompanyDrawer from "@/components/company/CompanyDrawer";
import { useAuth } from "@/auth/AuthProvider";

export default function Companies() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerId, setDrawerId] = useState("");

  const savedQuery = useQuery({
    queryKey: ["crmSavedCompanies", "prospect"],
    queryFn: () => api.get("/crm/savedCompanies?stage=prospect"),
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const r = savedQuery.data?.rows || savedQuery.data?.data?.rows || [];
    if (!search.trim()) return r;
    const q = search.toLowerCase();
    return r.filter((x) => (x.name || x.company_name || String(x.company_id)).toLowerCase().includes(q));
  }, [savedQuery.data, search]);

  const onSelect = (id) => {
    setDrawerId(String(id));
    setDrawerOpen(true);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 lg:mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">Companies — Prospecting & Outreach</h1>
            {user && (<p className="text-sm text-gray-500 mt-1">User: {user.email}</p>)}
          </div>
        </div>

        {/* Smoke-test mock cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {["Acme Logistics","Globex Corp","Initech Shipping","Umbrella Freight"].map((name, idx) => (
            <div key={idx} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow border border-gray-200/60 p-4">
              <div className="text-sm text-gray-500">Smoke Test</div>
              <div className="text-lg font-semibold text-gray-900">{name}</div>
              <div className="text-xs text-gray-500">HQ: — | Shipments (12M): —</div>
            </div>
          ))}
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 md:p-6 shadow-lg border border-gray-200/60 mb-6 md:mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Input
                placeholder="Search your saved companies by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-gray-50 border-0 text-base"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>
        </div>

        {savedQuery.error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <div>
              <p className="font-bold">Data Retrieval Error</p>
              <p>{String(savedQuery.error?.message || savedQuery.error)}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => (
            <div key={r.company_id || r.id} className="bg-white rounded-2xl shadow border p-4">
              <div className="text-sm text-gray-500">Saved Company</div>
              <div className="text-lg font-semibold text-gray-900">{r.name || r.company_name || r.company_id}</div>
              <div className="mt-3">
                <Button size="sm" onClick={() => onSelect(r.company_id || r.id)}>View</Button>
              </div>
            </div>
          ))}
        </div>

        {(!savedQuery.isLoading && rows.length === 0) && (
          <div className="text-center py-12 md:py-16">
            <h3 className="text-lg md:text-xl font-semibold text-gray-600 mb-2">No Saved Companies Found</h3>
            <p className="text-gray-500">Use Search to save companies to your list.</p>
          </div>
        )}
      </div>

      <CompanyDrawer id={drawerId} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

