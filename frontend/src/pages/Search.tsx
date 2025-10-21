3900&import { searchCompanies as searchCompaniesApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { api, postSearchCompanies, saveCompanyToCrm } from "@/lib/api";
import { hasFeature } from "@/lib/access";
import { upsertSaved } from "@/components/command-center/storage";
import CompanyDrawer from "@/components/company/CompanyDrawer";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon } from "lucide-react";
import AutocompleteInput from "@/components/search/AutocompleteInput";
import { useNavigate } from "react-router-dom";
// @ts-nocheck
import LitPageHeader from "../components/ui/LitPageHeader";
import LitPanel from "../components/ui/LitPanel";
import LitWatermark from "../components/ui/LitWatermark";

import SearchFilters from "@/components/search/SearchFilters";
import CompanyDetailModal from "../components/search/CompanyDetailModal";
import SearchResults from "../components/search/SearchResults";
import UpgradePrompt from "../components/common/UpgradePrompt";

const ITEMS_PER_PAGE = 50;

export default function Search() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    mode: "any",
    origin: "",
    destination: "",
    carrier: "",
    hs: [],
    date_start: null,
    date_end: null,
  });

  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  const [savedCompanyIds, setSavedCompanyIds] = useState(new Set());
  const [savingCompanyId, setSavingCompanyId] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerId, setDrawerId] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (hasSearched) {
      handleSearch(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, filters]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil((totalResults || 0) / ITEMS_PER_PAGE));
  }, [totalResults]);

  const handleSearch = useCallback(
    async (page) => {
      const p = page || 1;
      try { console.debug('[Search] handleSearch called', { q: searchQuery, page: p }); } catch {}
      setIsLoading(true);
      setSearchError(null);
      setCurrentPage(p);
      setHasSearched(true);

      try {
        const offset = (p - 1) * ITEMS_PER_PAGE;
        const sanitize = (s) => String(s).replace(/["']/g, "").trim();
        const hsText = (filters.hs_text || "")
          .split(",")
          .map(sanitize)
          .filter(Boolean);
        const hsMerged = Array.isArray(filters.hs)
          ? Array.from(new Set([...filters.hs, ...hsText]))
          : hsText;
        const hs_codes = (hsMerged || [])
          .map((s) => s.replace(/[^0-9]/g, ""))
          .filter(Boolean);
        const mode =
          filters.mode && filters.mode !== "any"
            ? filters.mode === "air"
              ? "air"
              : "ocean"
            : undefined;
        const originArr = filters.origin ? [sanitize(filters.origin)] : [];
        const destArr = filters.destination ? [sanitize(filters.destination)] : [];

        const qSanitized = sanitize(searchQuery || "");
        const body = {
          ...(qSanitized ? { q: qSanitized } : {}),
          ...(mode ? { mode } : {}),
          origin: originArr,
          dest: destArr,
          hs: hs_codes,
          limit: ITEMS_PER_PAGE,
          offset,
        };

        const resp = await postSearchCompanies(body);
        try { console.debug('[Search] postSearchCompanies ok', { payload: body, resp }); } catch {}
        const raw = Array.isArray(resp?.items) ? resp.items : (Array.isArray(resp?.rows) ? resp.rows : []);
        const total = typeof resp?.total === 'number' ? resp.total : (Array.isArray(raw) ? raw.length : 0);

        const mapped = (raw || []).map((item) => {
          const id =
            item.company_id ||
            item.id ||
            (item.company_name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const name = item.company_name || item.name || "Unknown";
          const topRoute = Array.isArray(item.top_routes)
            ? `${item.top_routes?.[0]?.origin_country || ""} → ${item.top_routes?.[0]?.dest_country || ""}`.trim()
            : (Array.isArray(item.originsTop) && Array.isArray(item.destsTop)
                ? `${item.originsTop[0]?.v || ""} → ${item.destsTop[0]?.v || ""}`.trim()
                : undefined);
          const shipments12m = item.shipments_12m ?? item.shipments ?? 0;
          const lastSeen = (item.last_activity && item.last_activity.value) || item.lastShipmentDate || null;
          return {
            id,
            company_id: item.company_id || null,
            name,
            domain: item.domain || null,
            website: item.website || null,
            hq_city: item.hq_city || null,
            hq_state: item.hq_state || null,
            shipments_12m: shipments12m,
            last_seen: lastSeen,
            top_route: topRoute,
            top_carrier: Array.isArray(item.carriersTop) ? (item.carriersTop[0]?.v || undefined) : undefined,
            total_teus: item.total_teus ?? null,
            growth_rate: item.growth_rate ?? null,
          };
        });

        const seen = new Set();
        const results = [];
        for (const row of mapped) {
          const key = row.company_id || `name:${row.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push(row);
          if (results.length >= ITEMS_PER_PAGE) break;
        }

        setSearchResults(results);
        setTotalResults(total);
      } catch (error) {
        console.error("Search error:", error);
        const msg = String(error?.message || "internal error");
        if (msg.includes("searchCompanies.sql") || msg.includes("ENOENT")) {
          setSearchError("Search service is updating. Please retry in a moment.");
        } else {
          setSearchError(msg);
        }
        setSearchResults([]);
        setTotalResults(0);
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery, filters]
  );

  const payload = useMemo(() => {
    const sanitize = (s) => String(s).replace(/["']/g, "").trim();
    const hsText = (filters.hs_text || "")
      .split(",")
      .map(sanitize)
      .filter(Boolean);
    const hsMerged = Array.isArray(filters.hs)
      ? Array.from(new Set([...filters.hs, ...hsText]))
      : hsText;
    const hs_codes = (hsMerged || [])
      .map((s) => s.replace(/[^0-9]/g, ""))
      .filter(Boolean);
    const mode =
      filters.mode && filters.mode !== "any"
        ? filters.mode === "air"
          ? "AIR"
          : "OCEAN"
        : undefined;
    const origin = filters.origin ? [sanitize(filters.origin)] : undefined;
    const dest = filters.destination ? [sanitize(filters.destination)] : undefined;
    const qSanitized = sanitize(searchQuery || "");
    return {
      ...(qSanitized ? { q: qSanitized } : {}),
      ...(mode ? { mode } : {}),
      ...(origin ? { origin } : {}),
      ...(dest ? { dest } : {}),
      ...(hs_codes.length ? { hs: hs_codes } : {}),
      limit: ITEMS_PER_PAGE,
      offset: (currentPage - 1) * ITEMS_PER_PAGE,
    };
  }, [filters, currentPage, searchQuery]);

  const resultsQuery = useQuery({
    queryKey: ["searchCompanies", payload],
    queryFn: async () => {
      let resp;
      try {
        resp = await postSearchCompanies(payload);
      } catch (e) {
        // Fallback: always use proxy path to avoid CORS and HTML responses
        const r = await fetch(
          `/api/lit/public/searchCompanies`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(
            `Search failed. Please try again. (${r.status}) ${t.slice(0, 160)}`
          );
        }
        resp = await r.json();
      }
      const raw = Array.isArray(resp?.items) ? resp.items : (Array.isArray(resp?.rows) ? resp.rows : []);
      const mapped = raw.map((item) => {
        const name = item.company_name || item.name || "Unknown";
        const id = item.company_id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const shipments12m = item.shipments_12m ?? item.shipments ?? 0;
        const lastSeen = (item.last_activity && item.last_activity.value) || item.lastShipmentDate || null;
        const topRoute = Array.isArray(item.top_routes)
          ? `${item.top_routes?.[0]?.origin_country || ""} → ${item.top_routes?.[0]?.dest_country || ""}`.trim()
          : (Array.isArray(item.originsTop) && Array.isArray(item.destsTop)
              ? `${item.originsTop[0]?.v || ""} → ${item.destsTop[0]?.v || ""}`.trim()
              : undefined);
        return {
          id,
          company_id: item.company_id || null,
          name,
          domain: item.domain || null,
          website: item.website || null,
          hq_city: item.hq_city || null,
          hq_state: item.hq_state || null,
          shipments_12m: shipments12m,
          last_seen: lastSeen,
          top_route: topRoute,
          top_carrier: Array.isArray(item.carriersTop) ? (item.carriersTop[0]?.v || undefined) : undefined,
          total_teus: item.total_teus ?? null,
          growth_rate: item.growth_rate ?? null,
        };
      });
      const seen = new Set();
      const rows = [];
      for (const row of mapped) {
        const key = row.company_id || `name:${row.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
        if (rows.length >= ITEMS_PER_PAGE) break;
      }
      return {
        rows,
        meta: {
          total: resp?.total || rows.length,
          page: currentPage,
          page_size: ITEMS_PER_PAGE,
        },
      };
    },
    enabled: hasSearched,
  });

  const handleCompanySelect = useCallback((company) => {
    setSelectedCompany(company);
    setDrawerId(String(company?.id || company?.company_id || ""));
    setDrawerOpen(false);
    setShowDetailModal(true);
  }, []);

  const handleSaveCompany = async (company) => {
    if (savingCompanyId) return;

    const companyId = company.id;
    setSavingCompanyId(companyId);

    const originalSavedIds = new Set(savedCompanyIds);
    const isCurrentlySaved = originalSavedIds.has(companyId);

    const optimisticNewIds = new Set(originalSavedIds);
    if (!isCurrentlySaved) {
      optimisticNewIds.add(companyId);
    }
    setSavedCompanyIds(optimisticNewIds);

    try {
      // Subscription gate for CRM save (with whitelist bypass)
      const email = String(user?.email || '').toLowerCase();
      const allowed = email === 'vraymond@logisticintel.com' || email === 'support@logisticintel.com' || hasFeature('crm');
      if (!allowed) {
        setUpgradeFeature('crm');
        setShowUpgradePrompt(true);
        // rollback optimistic UI
        setSavedCompanyIds(originalSavedIds);
        setSavingCompanyId(null);
        return;
      }
      const res = await saveCompanyToCrm({
        company_id: String(company.company_id || company.id || ""),
        company_name: String(company.name || company.company_name || "Unknown"),
        source: "search",
      });
      if (!res || !(res.status === "created" || res.status === "exists")) {
        throw new Error("Save failed");
      }
      try {
        upsertSaved({ company_id: String(company.company_id || company.id || ""), name: String(company.name || company.company_name || "Company"), domain: company.domain ?? null, source: 'LIT', ts: Date.now(), archived: false });
      } catch {}
      // Persist selection + active filters for Command Center hydration
      try {
        const cid = String(company.company_id || company.id || "");
        const cname = String(company.name || company.company_name || "Company");
        const saved = {
          company_id: cid,
          name: cname,
          savedAt: new Date().toISOString(),
          filters: normalizeFilters(filters),
        } as any;
        localStorage.setItem('cc:savedCompany', JSON.stringify(saved));
        localStorage.setItem('lit:selectedCompany', JSON.stringify({ company_id: cid, name: cname, domain: company.domain ?? null }));
        localStorage.setItem('cc:activeFilters', JSON.stringify(saved.filters));
      } catch {}
      navigate("/app/command-center");
    } catch (error) {
      try {
        const id = String(
          company.company_id ||
            company.id ||
            "comp_" + Math.random().toString(36).slice(2, 8)
        );
        const lsKey = "lit_companies";
        const raw = localStorage.getItem(lsKey);
        const existing = raw ? JSON.parse(raw) : [];
        const name = String(company.name || company.company_name || "Company");
        const fresh = {
          id,
          name,
          kpis: {
            shipments12m: company.shipments_12m || 0,
            lastActivity: company.last_seen || null,
            originsTop: [],
            destsTop: [],
            carriersTop: [],
          },
        };
        localStorage.setItem(lsKey, JSON.stringify([fresh, ...existing]));
        try {
          upsertSaved({ company_id: id || null, name, domain: company.domain ?? null, source: 'LIT', ts: Date.now(), archived: false });
        } catch {}
        // Persist selection + active filters and redirect
        try {
          const saved = {
            company_id: id,
            name,
            savedAt: new Date().toISOString(),
            filters: normalizeFilters(filters),
          } as any;
          localStorage.setItem('cc:savedCompany', JSON.stringify(saved));
          localStorage.setItem('lit:selectedCompany', JSON.stringify({ company_id: id, name, domain: company.domain ?? null }));
          localStorage.setItem('cc:activeFilters', JSON.stringify(saved.filters));
        } catch {}
        navigate("/app/command-center");
      } catch (e) {
        console.error("Failed to save company:", error);
        setSavedCompanyIds(originalSavedIds);
        alert("Failed to save company. Please try again.");
      }
    } finally {
      setSavingCompanyId(null);
    }
  };

  const handleStartOutreach = (company) => {
    try {
      navigate("/campaigns/new");
    } catch {
      // noop
    }
  };

  const handleDraftRFP = (company) => {
    try {
      navigate("/rfp/new");
    } catch {
      // noop
    }
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    handleSearch(page);
  };

  return (
    <div className="relative px-2 md:px-5 py-3 min-h-screen">
      <LitWatermark />
      <div className="max-w-7xl mx-auto">
        <LitPageHeader title="Search" />

        <LitPanel>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Input data-test="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by company name or alias (e.g., UPS, Maersk)..."
                className="pl-4 pr-12 py-3 text-base md:text-lg bg-gray-50 border-0 rounded-xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { try{ console.debug('[Search] enter submit'); }catch{} handleSearch(1); }
                }}
              />
              <SearchIcon className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>

            <Button data-test="search-button"
              onClick={() => { try{ console.debug('[Search] click submit'); }catch{} handleSearch(1); }}
              disabled={isLoading}
              className="px-6 md:px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl"
            >
              {isLoading ? "Searching..." : "Search"}
            </Button>
          </div>
        </LitPanel>

        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-slate-700">Filters</div>
          <button
            className="text-sm px-3 py-1.5 rounded border bg-white hover:bg-slate-50"
            onClick={() => setShowFilters((v) => !v)}
          >
            {showFilters ? "Hide Filters" : "Show Filters"}
          </button>
        </div>
        {showFilters && (
          <div className="mb-6">
            <LitPanel title="Filters">
              <SearchFilters
                value={{
                  origin: filters.origin ? String(filters.origin) : null,
                  destination: filters.destination ? String(filters.destination) : null,
                  hs: (filters.hs_text ? String(filters.hs_text) : null),
                  mode: (filters.mode === 'air' || filters.mode === 'ocean') ? filters.mode : null,
                }}
                onChange={(next) => {
                  setFilters((prev) => ({
                    ...prev,
                    origin: next.origin ?? '',
                    destination: next.destination ?? '',
                    hs_text: next.hs ?? '',
                    mode: next.mode ?? 'any',
                  }));
                }}
              />
            </LitPanel>
          </div>
        )}

        {searchError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-red-800">
              <span className="font-semibold">Search Error:</span>
              <span>{searchError}</span>
            </div>
          </div>
        )}

        {hasSearched ? (
          <SearchResults
            searchResults={
              resultsQuery.data?.rows && resultsQuery.data.rows.length > 0
                ? resultsQuery.data.rows
                : searchResults
            }
            totalResults={
              resultsQuery.data?.meta?.total && resultsQuery.data.meta.total > 0
                ? resultsQuery.data.meta.total
                : totalResults
            }
            isLoading={isLoading || resultsQuery.isLoading}
            onCompanySelect={handleCompanySelect}
            onSave={handleSaveCompany}
            onStartOutreach={handleStartOutreach}
            onDraftRFP={handleDraftRFP}
            user={user}
            newShipperEvents={[]}
            savedCompanyIds={savedCompanyIds}
            savingCompanyId={savingCompanyId}
            viewMode={viewMode}
            setViewMode={setViewMode}
            selectedId={drawerId}
            currentPage={currentPage}
            totalPages={Math.max(
              1,
              Math.ceil(
                ((resultsQuery.data?.meta?.total &&
                  resultsQuery.data.meta.total > 0
                  ? resultsQuery.data.meta.total
                  : totalResults) /
                  ITEMS_PER_PAGE) || 1
              )
            )}
            onPageChange={handlePageChange}
          />
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
            <SearchIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              Ready to Search
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Enter a company name or use the filters above to search for trade
              intelligence data.
            </p>
          </div>
        )}

        <UpgradePrompt
          isOpen={showUpgradePrompt}
          onClose={() => setShowUpgradePrompt(false)}
          feature={upgradeFeature}
          currentPlan={user?.plan}
        />

        <CompanyDetailModal
          company={selectedCompany}
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          onSave={handleSaveCompany}
          user={user}
          isSaved={savedCompanyIds.has(selectedCompany?.id)}
        />
      </div>
    </div>
  );
}