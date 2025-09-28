import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from '@tanstack/react-query';
import { api, postSearchCompanies } from '@/lib/api';
import CompanyDrawer from '@/components/company/CompanyDrawer';
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import SearchFilters from "../components/search/SearchFilters";
import CompanyDetailModal from "../components/search/CompanyDetailModal";
import SearchResults from "../components/search/SearchResults";
import UpgradePrompt from "../components/common/UpgradePrompt";

import { searchCompanies } from "@/lib/api";
import { saveCompany } from "@/api/functions";
import { createCompany } from "@/lib/crm";

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
    date_end: null
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
  const [viewMode, setViewMode] = useState("grid");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerId, setDrawerId] = useState("");
  
  const [hasSearched, setHasSearched] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    // Auto search on filter changes or debounced query changes, starting from page 1
    if (hasSearched) {
      handleSearch(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, filters]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil((totalResults || 0) / ITEMS_PER_PAGE));
  }, [totalResults]);

  // user is provided by AuthProvider; no additional load needed

  const handleSearch = useCallback(async (page) => {
    const p = page || 1;
    setIsLoading(true);
    setSearchError(null);
    setCurrentPage(p);
    setHasSearched(true);

    try {
      const offset = (p - 1) * ITEMS_PER_PAGE;
      const hsText = (filters.hs_text || '').split(',').map(s => s.trim()).filter(Boolean);
      const hsMerged = Array.isArray(filters.hs) ? Array.from(new Set([...filters.hs, ...hsText])) : hsText;
      const hs_codes = (hsMerged || []).map(s => s.replace(/[^0-9]/g, '')).filter(Boolean);
      const mode = (filters.mode && filters.mode !== 'any') ? (filters.mode === 'air' ? 'air' : 'ocean') : undefined;
      const origin = filters.origin ? [filters.origin] : undefined;
      const dest = filters.destination ? [filters.destination] : undefined;

      const body = {
        ...(searchQuery ? { q: searchQuery } : {}),
        ...(mode ? { mode } : {}),
        ...(origin ? { origin } : {}),
        ...(dest ? { dest } : {}),
        ...(hs_codes.length ? { hs: hs_codes } : {}),
        limit: ITEMS_PER_PAGE,
        offset,
      } as const;

      let resp;
      try {
        resp = await postSearchCompanies(body as any);
      } catch (e) {
        // Fallback to legacy /search endpoint
        const legacy = {
          q: searchQuery || "",
          mode: filters.mode && filters.mode !== 'any' ? filters.mode : 'all',
          filters: {
            origin: filters.origin || undefined,
            destination: filters.destination || undefined,
            hs: (hs_codes && hs_codes.length) ? hs_codes : undefined,
          },
          pagination: { limit: ITEMS_PER_PAGE, offset },
        } as const;
        resp = await api.post('/search', legacy as any);
      }
      const raw = Array.isArray((resp as any)?.items) ? (resp as any).items : [];
      const total = typeof (resp as any)?.total === 'number' ? (resp as any).total : (raw as any[]).length;

      // Normalize to UI shape expected by cards/list items
      const mapped = (raw as any[]).map((item: any) => {
        const id = item.company_id || item.id || (item.company_name || '').toLowerCase?.().replace?.(/[^a-z0-9]+/g, '-') || undefined;
        const name = item.company_name || 'Unknown';
        const topRoute = (Array.isArray(item.originsTop) && Array.isArray(item.destsTop)) ? `${item.originsTop[0]?.v || ''} → ${item.destsTop[0]?.v || ''}`.trim() : undefined;
        const topCarrier = Array.isArray(item.carriersTop) ? (item.carriersTop[0]?.v || undefined) : undefined;
        return {
          id,
          company_id: item.company_id || null,
          name,
          shipments_12m: item.shipments || 0,
          last_seen: item.lastShipmentDate || null,
          top_route: topRoute,
          top_carrier: topCarrier,
        };
      });
      // Dedupe by company_id (fallback name) and cap to ITEMS_PER_PAGE
      const seen = new Set<string>();
      const results: any[] = [];
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
      setSearchError((error?.message && String(error.message)) || "Search failed. Please try again.");
      setSearchResults([]);
      setTotalResults(0);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, filters]);

  const payload = useMemo(() => {
    const hsText = (filters.hs_text || '').split(',').map(s => s.trim()).filter(Boolean);
    const hsMerged = Array.isArray(filters.hs) ? Array.from(new Set([...filters.hs, ...hsText])) : hsText;
    const hs_codes = (hsMerged || []).map(s => s.replace(/[^0-9]/g, '')).filter(Boolean);
    const mode = (filters.mode && filters.mode !== 'any') ? (filters.mode === 'air' ? 'air' : 'ocean') : undefined;
    const origin = filters.origin ? [filters.origin] : undefined;
    const dest = filters.destination ? [filters.destination] : undefined;
    return {
      ...(searchQuery ? { q: searchQuery } : {}),
      ...(mode ? { mode } : {}),
      ...(origin ? { origin } : {}),
      ...(dest ? { dest } : {}),
      ...(hs_codes.length ? { hs: hs_codes } : {}),
      limit: ITEMS_PER_PAGE,
      offset: (currentPage - 1) * ITEMS_PER_PAGE,
    } as const;
  }, [filters, currentPage, searchQuery]);

  const resultsQuery = useQuery({
    queryKey: ['searchCompanies', payload],
    queryFn: async () => {
      const resp = await postSearchCompanies(payload as any);
      const raw = Array.isArray((resp as any)?.items) ? (resp as any).items : [];
      const mapped = raw.map((item) => ({
        id: item.company_id || (item.company_name || '').toLowerCase().replace(/[^a-z0-9]+/g,'-'),
        company_id: item.company_id || null,
        name: item.company_name || 'Unknown',
        shipments_12m: item.shipments || 0,
        last_seen: item.lastShipmentDate || null,
        top_route: (Array.isArray(item.originsTop) && Array.isArray(item.destsTop)) ? `${item.originsTop[0]?.v || ''} → ${item.destsTop[0]?.v || ''}`.trim() : undefined,
        top_carrier: Array.isArray(item.carriersTop) ? (item.carriersTop[0]?.v || undefined) : undefined,
      }));
      const seen = new Set<string>();
      const rows: any[] = [];
      for (const row of mapped) {
        const key = row.company_id || `name:${row.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
        if (rows.length >= ITEMS_PER_PAGE) break;
      }
      return { rows, meta: { total: (resp as any).total || rows.length, page: currentPage, page_size: ITEMS_PER_PAGE } };
    },
    keepPreviousData: true,
    enabled: hasSearched,
  });

  const handleCompanySelect = useCallback((company) => {
    setSelectedCompany(company);
    setDrawerId(String(company?.id || company?.company_id || ''));
    setDrawerOpen(true);
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
      // Save to CRM via Gateway
      const res = await createCompany({ name: company.name, website: company.website || undefined, external_ref: String(companyId) });
      // Treat as saved if backend returns an id or ok
      if (!res || (!res.id && !res.ok)) throw new Error('Save failed');
    } catch (error) {
      console.error("Failed to save company:", error);
      setSavedCompanyIds(originalSavedIds);
      alert("Failed to save company. Please try again.");
    } finally {
      setSavingCompanyId(null);
    }
  };

  const handleStartOutreach = (company) => {
    const companyId = company.id;
    if (companyId) {
      navigate(createPageUrl("EmailCenter?company_id=" + companyId));
    }
  };

  const handleDraftRFP = (company) => {
    const companyId = company.id;
    if (companyId) {
      navigate(createPageUrl("RFPStudio?company_id=" + companyId));
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && !isLoading) {
      handleSearch(newPage);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 lg:mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">
              Trade Intelligence Discovery
            </h1>
            <p className="text-gray-600 mt-2 text-sm md:text-base">
              Search companies by trade activity, routes, commodities, and shipping patterns
            </p>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-4 md:p-6 mb-6 md:mb-8 border border-gray-200/60">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by company name or alias (e.g., UPS, Maersk)..."
                className="pl-4 pr-12 py-3 text-base md:text-lg bg-gray-50 border-0 rounded-xl"
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(1); }}
              />
              <SearchIcon className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>

            <Button
              onClick={() => handleSearch(1)}
              disabled={isLoading}
              className="px-6 md:px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl"
            >
              {isLoading ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>

        <SearchFilters onChange={setFilters} />

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
            searchResults={(resultsQuery.data?.rows && resultsQuery.data.rows.length > 0) ? resultsQuery.data.rows : searchResults}
            totalResults={(resultsQuery.data?.meta?.total && resultsQuery.data.meta.total > 0) ? resultsQuery.data.meta.total : totalResults}
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
            currentPage={currentPage}
            totalPages={Math.max(1, Math.ceil((((resultsQuery.data?.meta?.total && resultsQuery.data.meta.total > 0) ? resultsQuery.data.meta.total : totalResults) / ITEMS_PER_PAGE) || 1))}
            onPageChange={handlePageChange}
          />
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
            <SearchIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Search</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              Enter a company name or use the filters above to search for trade intelligence data.
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
      <CompanyDrawer id={drawerId} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
