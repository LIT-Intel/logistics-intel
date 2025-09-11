
import React, { useState, useEffect, useCallback } from "react";
import { Company, CompanySave } from "@/api/entities";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  Grid3X3,
  List,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence } from "framer-motion";
import { checkFeatureAccess } from "@/components/utils/planLimits";
import LockedFeature from "@/components/common/LockedFeature";

import CompanyCard from "../components/companies/CompanyCard";
import UpgradePrompt from "../components/common/UpgradePrompt";
import CompanyListItem from "../components/companies/CompanyListItem";
import CompanyDetailModal from "../components/search/CompanyDetailModal";

const ITEMS_PER_PAGE = 12;

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [appUser, setAppUser] = useState(null);
  const [viewMode, setViewMode] = useState("cards");
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasAccess, setHasAccess] = useState(null); // null: checking, true: granted, false: denied

  const navigate = useNavigate();

  // Callback to load saved companies, now correctly leveraging appUser from state
  const loadSavedCompanies = useCallback(async () => {
    // If access is explicitly denied, prevent loading data
    if (hasAccess === false) {
      console.log("🚫 Access denied. Not loading saved companies.");
      setIsLoading(false);
      return;
    }

    // If appUser isn't set yet, wait for it. The debounce effect will re-trigger
    // loadSavedCompanies when appUser is set.
    if (!appUser) {
      console.log("⏳ Waiting for appUser to be loaded before fetching companies...");
      setIsLoading(false); // Stop loading spinner while waiting for user data
      return;
    }

    setIsLoading(true);
    setLoadingError(null);

    try {
      console.log("🔍 Fetching CompanySave records for user:", appUser.email);
      // STEP 1: Get all CompanySave records for this user
      const savedRecords = await CompanySave.filter({ created_by: appUser.email });
      console.log("✅ Found saved records:", savedRecords.length);

      // Add delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

      if (savedRecords.length === 0) {
        console.log("📝 No saved companies found");
        setCompanies([]);
        setTotalCount(0);
        setIsLoading(false);
        return;
      }

      // STEP 2: Extract company IDs and fetch company details
      const companyIds = savedRecords.map(record => record.company_id).filter(Boolean);
      console.log("🔍 Fetching details for company IDs:", companyIds);

      // Add another small delay
      await new Promise(resolve => setTimeout(resolve, 100));

      const companiesData = await Company.filter({
        id: { op: 'in', value: companyIds }
      });
      console.log("✅ Found company details:", companiesData.length);

      // Apply search filter if provided
      const filtered = searchQuery.trim()
        ? companiesData.filter(company =>
            (company.name || "").toLowerCase().includes(searchQuery.toLowerCase())
          )
        : companiesData;

      setCompanies(filtered);
      setTotalCount(filtered.length);

    } catch (error) {
      console.error("❌ Error loading saved companies:", error);
      setLoadingError(error?.message || "Failed to load saved companies");
      setCompanies([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, hasAccess, appUser]); // appUser is necessary here as it's used in CompanySave.filter


  // Effect to check user access and initially load companies if access is granted
  // This effect runs once on mount to establish user and access status.
  useEffect(() => {
    const checkAccess = async () => {
      setIsLoading(true); // Ensure loading state is true while checking access
      try {
        console.log("🔍 Checking user access for 'company_details' feature...");
        const user = await User.me();
        setAppUser(user);
        const access = checkFeatureAccess(user, 'company_details');
        setHasAccess(access);
        console.log(`✅ Access for 'company_details': ${access}`);

        if (access) {
          // If access is granted, the debounce effect will pick up the appUser change
          // and trigger loadSavedCompanies appropriately.
          // No direct call to loadSavedCompanies() is needed here to avoid race conditions/redundancy.
          setIsLoading(false); // Set to false, debounce effect will re-set if needed
        } else {
          // If no access, stop loading to allow LockedFeature to display
          setIsLoading(false);
        }
      } catch (e) {
        console.error("❌ Error checking feature access or loading user:", e);
        setHasAccess(false); // Assume no access on error
        setLoadingError("Failed to check access. Please try again.");
        setIsLoading(false);
      }
    };
    checkAccess();
  }, []); // Empty dependency array ensures this runs only once on mount


  // Debounce effect for search query changes and initial load once user/access are set
  useEffect(() => {
    // Only apply debounce and load companies if access is granted and appUser is available
    if (hasAccess === true && appUser) {
      const timeoutId = setTimeout(() => {
        loadSavedCompanies();
      }, 300); // 300ms debounce

      return () => clearTimeout(timeoutId);
    } else if (hasAccess === true && !appUser) {
        // If access is granted but appUser is not yet loaded, ensures spinner is active
        // and loadSavedCompanies's internal check will handle the 'waiting' state.
        setIsLoading(true);
    }
  }, [searchQuery, loadSavedCompanies, hasAccess, appUser]); // appUser must be a dependency here to re-trigger when set

  const handleSearchKeyPress = (e) => {
    if (e.key === "Enter") {
      loadSavedCompanies();
    }
  };

  const handleViewCompany = (company) => {
    // Gating: Check feature access before showing company details
    if (!checkFeatureAccess(appUser, 'company_details')) {
      console.log("🚫 User does not have access to 'company_details'. Showing upgrade prompt.");
      setShowUpgradePrompt(true); // Show upgrade prompt if access is denied
      return;
    }
    setSelectedCompany(company);
    setIsDetailModalOpen(true);
  };

  const handleStartOutreach = (company) => {
    console.log("🚀 Starting outreach for company:", company.name);
    navigate(createPageUrl(`EmailCenter?company_id=${company.id}`));
  };

  const handleDeleteCompany = async (companyId) => {
    if (!appUser) {
      console.warn("User not loaded. Cannot delete company save record.");
      alert("User not logged in. Cannot delete company.");
      return;
    }

    if (!window.confirm("Are you sure you want to remove this company from your saved list?")) {
      return;
    }

    try {
      console.log("🔍 Attempting to delete CompanySave record for company ID:", companyId, "by user:", appUser.email);
      const savedRecords = await CompanySave.filter({
        created_by: appUser.email,
        company_id: companyId,
      });

      if (savedRecords.length > 0) {
        await CompanySave.delete(savedRecords[0].id);
        console.log("✅ Company save record successfully deleted.");
        loadSavedCompanies(); // Reload the list after deletion
      } else {
        console.log("❌ No matching CompanySave record found for deletion.");
        alert("Company save record not found.");
      }
    } catch (error) {
      console.error("❌ Failed to remove company from saved list:", error);
      alert("Failed to remove company. Please try again.");
    }
  };

  const handleSaveCompanyInModal = () => {
    console.log("📝 Company is already saved - no action needed from modal save button.");
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Initial loading state while access is being determined
  if (isLoading && hasAccess === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // If access is denied after checking
  if (hasAccess === false) {
    console.log("🔒 Displaying LockedFeature due to denied access.");
    return <LockedFeature featureName="Viewing Saved Companies" />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 lg:mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">
              Saved Companies
            </h1>
            <p className="text-gray-600 mt-2 text-sm md:text-base">
              All companies you've saved from your search results.
            </p>
            {appUser && (
              <p className="text-sm text-gray-500 mt-1">
                User: {appUser.email} | Plan: {appUser.plan || 'free'}
              </p>
            )}
          </div>
          <Button
            onClick={() => navigate(createPageUrl("Search"))}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg flex items-center gap-2 w-full sm:w-auto"
          >
            <Search className="w-4 h-4 mr-2" />
            Find Companies to Save
          </Button>
        </div>

        {/* Search */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 md:p-6 shadow-lg border border-gray-200/60 mb-6 md:mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Input
                placeholder="Search your saved companies by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleSearchKeyPress}
                className="pl-10 bg-gray-50 border-0 text-base"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>
        </div>

        {loadingError && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <div>
              <p className="font-bold">Data Retrieval Error</p>
              <p>{loadingError}</p>
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-gray-600 text-sm md:text-base">
            Showing{" "}
            <span className="font-medium">
              {companies.length} of {totalCount} saved companies
            </span>
          </p>
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <Button
                variant={viewMode === "cards" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("cards")}
                className="h-8 px-3"
              >
                <Grid3X3 className="w-4 h-4 mr-1" />
                Cards
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="h-8 px-3"
              >
                <List className="w-4 h-4 mr-1" />
                List
              </Button>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {isLoading && hasAccess !== false ? ( // This spinner handles loading state *after* access is granted (or while checking before denying)
            <div className="flex justify-center items-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : companies.length > 0 ? (
            <motion.div
              key={viewMode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={
                viewMode === "cards"
                  ? "grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6"
                  : "bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/60 overflow-hidden"
              }
            >
              {companies.map((company, index) =>
                viewMode === "cards" ? (
                  <CompanyCard
                    key={company.id}
                    company={company}
                    onDelete={() => handleDeleteCompany(company.id)}
                    onView={() => handleViewCompany(company)}
                    onStartOutreach={() => handleStartOutreach(company)}
                  />
                ) : (
                  <CompanyListItem
                    key={company.id}
                    company={company}
                    onView={() => handleViewCompany(company)}
                    onStartOutreach={() => handleStartOutreach(company)}
                    onDelete={() => handleDeleteCompany(company.id)}
                    index={index}
                  />
                )
              )}
            </motion.div>
          ) : (
            <div className="text-center py-12 md:py-16">
              <h3 className="text-lg md:text-xl font-semibold text-gray-600 mb-2">
                No Saved Companies Found
              </h3>
              <p className="text-gray-500 mb-6 text-sm md:text-base px-4">
                Go to the Search page to find and save companies to your list.
              </p>
              <Button
                onClick={() => navigate(createPageUrl("Search"))}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
              >
                <Search className="w-4 h-4 mr-2" />
                Find Companies to Save
              </Button>
            </div>
          )}
        </AnimatePresence>

        <CompanyDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          company={selectedCompany}
          user={appUser} // Pass the current appUser to the modal
          onSave={handleSaveCompanyInModal}
        />

        <UpgradePrompt
          isOpen={showUpgradePrompt}
          onClose={() => setShowUpgradePrompt(false)}
          feature="company_details"
          currentPlan={appUser?.plan}
        />
      </div>
    </div>
  );
}
