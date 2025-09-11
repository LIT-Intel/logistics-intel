
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import SearchFilters from "../components/search/SearchFilters";
import CompanyDetailModal from "../components/search/CompanyDetailModal";
import SearchResults from "../components/search/SearchResults";
import UpgradePrompt from "../components/common/UpgradePrompt";

import { searchCompanies } from "@/api/functions/searchCompanies";
import { saveCompany } from "@/api/functions";

const ITEMS_PER_PAGE = 25;

export default function Search() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    mode: "",
    origin: "",
    destination: "",
    date_start: null,
    date_end: null
  });

  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
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
  
  const [hasSearched, setHasSearched] = useState(false);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil((totalResults || 0) / ITEMS_PER_PAGE));
  }, [totalResults]);

  const loadUser = useCallback(async () => {
    try {
      const userData = await User.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleSearch = useCallback(async (page) => {
    const p = page || 1;
    setIsLoading(true);
    setSearchError(null);
    setCurrentPage(p);
    setHasSearched(true);

    try {
      const payload = {
        q: searchQuery || null,
        origin: filters.origin || null,
        destination: filters.destination || null,
        mode: filters.mode || null,
        date_start: filters.date_start || null,
        date_end: filters.date_end || null,
        page: p,
        page_size: ITEMS_PER_PAGE
      };

      const resp = await searchCompanies(payload);
      
      if (resp.data?.ok && resp.data?.items) {
        setSearchResults(Array.isArray(resp.data.items) ? resp.data.items : []);
        setTotalResults(resp.data.total || 0);
      } else {
        setSearchResults([]);
        setTotalResults(0);
        setSearchError(resp.data?.error || "Search failed");
      }
    } catch (error) {
      console.error("Search error:", error);
      setSearchError("Search failed: " + (error?.message || "Unknown error"));
      setSearchResults([]);
      setTotalResults(0);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, filters]);

  const handleCompanySelect = useCallback((company) => {
    setSelectedCompany(company);
    setShowDetailModal(true);
  }, []);

  const handleSaveCompany = async (company) => {
    if (!user || savingCompanyId) return;

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
      const response = await saveCompany({ 
        company_id: companyId, 
        company_name: company.name,
      });

      if (response.data?.ok) {
        console.log("Company saved successfully");
      } else {
        throw new Error(response.data?.error || "Failed to save company");
      }
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
            searchResults={searchResults}
            totalResults={totalResults}
            isLoading={isLoading}
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
            totalPages={totalPages}
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
        />
      </div>
    </div>
  );
}
