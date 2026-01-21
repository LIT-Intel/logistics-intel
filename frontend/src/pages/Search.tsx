import React, { useState, useEffect } from "react";
import { Search as SearchIcon, Building2, MapPin, TrendingUp, Package, Ship, Plane, Calendar, Globe, X, BookmarkPlus, Bookmark, Eye, ArrowUpRight, Grid3x3, List, Loader2, Users, DollarSign, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import { searchShippers, fetchCompanySnapshot, type CompanySnapshot } from "@/lib/api";
import { parseImportYetiDate, formatUserFriendlyDate, getDateBadgeInfo } from "@/lib/dateUtils";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";

function getCountryFlag(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  return String.fromCodePoint(
    ...countryCode.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0))
  );
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return '$0';
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value}`;
}

interface MockCompany {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  country_code: string;
  address: string;
  website: string;
  industry: string;
  shipments: number;
  shipments_12m: number;
  teu_estimate?: number;
  revenue_range?: string;
  mode?: string;
  last_shipment: string;
  status: "Active" | "Inactive";
  frequency: "High" | "Medium" | "Low";
  trend: "up" | "flat" | "down";
  top_origins: string[];
  top_destinations: string[];
  top_suppliers: string[];
  gemini_summary: string;
  risk_flags: string[];
  importyeti_key?: string;
  enrichment_status?: 'pending' | 'partial' | 'complete';
  enriched_at?: string;
}

const MOCK_COMPANIES: MockCompany[] = [
  {
    id: "mock-1",
    name: "Acme Logistics International",
    city: "Los Angeles",
    state: "CA",
    country: "United States",
    country_code: "US",
    address: "1234 Harbor Blvd, Los Angeles, CA 90001",
    website: "acmelogistics.com",
    industry: "Import/Export",
    shipments: 2456,
    shipments_12m: 1234,
    teu_estimate: 3456,
    revenue_range: "$2M - $5M",
    mode: "Ocean",
    last_shipment: "2024-01-10",
    status: "Active",
    frequency: "High",
    trend: "up",
    top_origins: ["Shanghai, China", "Shenzhen, China", "Hong Kong"],
    top_destinations: ["Los Angeles", "Long Beach", "Oakland"],
    top_suppliers: ["Shenzhen Electronics Co", "Shanghai Manufacturer Ltd", "Hong Kong Trading"],
    gemini_summary: "High-frequency ocean importer with consistent Asia-US lanes, specializing in consumer electronics and industrial equipment. Strong track record with major Chinese manufacturers.",
    risk_flags: [],
  },
  {
    id: "mock-2",
    name: "Global Trade Partners LLC",
    city: "New York",
    state: "NY",
    country: "United States",
    country_code: "US",
    address: "789 Trade Center, New York, NY 10013",
    website: "globaltradepartners.com",
    industry: "Wholesale Trade",
    shipments: 1523,
    shipments_12m: 856,
    teu_estimate: 1842,
    revenue_range: "$1M - $2M",
    mode: "Air",
    last_shipment: "2024-01-08",
    status: "Active",
    frequency: "Medium",
    trend: "flat",
    top_origins: ["Frankfurt, Germany", "London, UK", "Amsterdam, Netherlands"],
    top_destinations: ["JFK Airport", "Newark", "Boston"],
    top_suppliers: ["Deutsche Logistics GmbH", "UK Export Partners", "Amsterdam Trade Co"],
    gemini_summary: "Mid-size air freight operator focused on European imports. Diversified supplier base with seasonal peaks in Q4. Reliable payment history.",
    risk_flags: ["Seasonal dependency"],
  },
  {
    id: "mock-3",
    name: "Pacific Shipping Company",
    city: "Seattle",
    state: "WA",
    country: "United States",
    country_code: "US",
    address: "4567 Port Ave, Seattle, WA 98101",
    website: "pacificshipping.com",
    industry: "Maritime Transport",
    shipments: 4892,
    shipments_12m: 2341,
    teu_estimate: 7234,
    revenue_range: "$5M - $10M",
    mode: "Ocean",
    last_shipment: "2024-01-12",
    status: "Active",
    frequency: "High",
    trend: "up",
    top_origins: ["Busan, South Korea", "Tokyo, Japan", "Yokohama, Japan"],
    top_destinations: ["Seattle", "Tacoma", "Portland"],
    top_suppliers: ["Busan Auto Parts", "Tokyo Machinery Corp", "Korea Trading Group"],
    gemini_summary: "Major Pacific Northwest importer with strong Japan and Korea connections. Focus on automotive parts and machinery. Excellent credit rating.",
    risk_flags: [],
  },
  {
    id: "mock-4",
    name: "Express Freight Services Inc",
    city: "Chicago",
    state: "IL",
    country: "United States",
    country_code: "US",
    address: "321 Airport Rd, Chicago, IL 60666",
    website: "expressfreight.com",
    industry: "Air Freight",
    shipments: 892,
    shipments_12m: 567,
    teu_estimate: 234,
    revenue_range: "$500K - $1M",
    mode: "Air",
    last_shipment: "2024-01-05",
    status: "Active",
    frequency: "Low",
    trend: "down",
    top_origins: ["Mexico City, Mexico", "Guadalajara, Mexico", "Monterrey, Mexico"],
    top_destinations: ["Chicago O'Hare", "Indianapolis", "Milwaukee"],
    top_suppliers: ["Mexico City Export Co", "Guadalajara Freight", "Monterrey Logistics"],
    gemini_summary: "Small air freight operation serving Mexican suppliers. Volume has declined 15% YoY. Single-origin dependency presents risk.",
    risk_flags: ["Volume decline", "Single-origin dependency"],
  },
  {
    id: "mock-5",
    name: "TransAtlantic Import Corp",
    city: "Miami",
    state: "FL",
    country: "United States",
    country_code: "US",
    address: "999 Commerce Blvd, Miami, FL 33132",
    website: "transatlanticimport.com",
    industry: "Distribution",
    shipments: 1678,
    shipments_12m: 1089,
    teu_estimate: 2341,
    revenue_range: "$2M - $5M",
    mode: "Ocean",
    last_shipment: "2024-01-11",
    status: "Active",
    frequency: "Medium",
    trend: "up",
    top_origins: ["Hamburg, Germany", "Rotterdam, Netherlands", "Antwerp, Belgium"],
    top_destinations: ["Miami", "Port Everglades", "Jacksonville"],
    top_suppliers: ["Hamburg Luxury Goods", "Rotterdam Trading", "Antwerp Auto Parts"],
    gemini_summary: "Established European importer with focus on luxury goods and automotive parts. Growing 20% YoY with strong fundamentals.",
    risk_flags: [],
  },
  {
    id: "mock-6",
    name: "West Coast Distribution Hub",
    city: "San Francisco",
    state: "CA",
    country: "United States",
    country_code: "US",
    address: "555 Bay Street, San Francisco, CA 94102",
    website: "westcoasthub.com",
    industry: "Warehousing",
    shipments: 3234,
    shipments_12m: 1876,
    teu_estimate: 4567,
    revenue_range: "$5M - $10M",
    mode: "Ocean",
    last_shipment: "2024-01-09",
    status: "Active",
    frequency: "High",
    trend: "up",
    top_origins: ["Shanghai, China", "Ningbo, China", "Qingdao, China"],
    top_destinations: ["Oakland", "San Francisco", "Richmond"],
    top_suppliers: ["Shanghai Industrial Co", "Ningbo Manufacturers", "Qingdao Trading Group", "Zhejiang Export Corp"],
    gemini_summary: "Large-scale distribution center handling diverse product categories. Strong relationships with multiple Chinese manufacturers. Expansion planned for 2024.",
    risk_flags: [],
  },
];

export default function SearchPage() {
  const { user, authReady } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<MockCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<MockCompany | null>(null);
  const [snapshotData, setSnapshotData] = useState<CompanySnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [savedCompanyIds, setSavedCompanyIds] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const loadSavedCompanies = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('lit_saved_companies')
          .select('company_id, lit_companies!inner(source_company_key)')
          .eq('user_id', user.id);

        if (error) throw error;

        if (data) {
          const ids = data
            .map((item: any) => item.lit_companies?.source_company_key)
            .filter(Boolean);
          setSavedCompanyIds(ids);
        }
      } catch (error) {
        console.error('Failed to load saved companies:', error);
      }
    };

    loadSavedCompanies();
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadSnapshot = async () => {
      if (!selectedCompany || !selectedCompany.importyeti_key) {
        setSnapshotData(null);
        return;
      }

      setLoadingSnapshot(true);
      console.log("[Search] Loading snapshot for:", selectedCompany.importyeti_key);

      try {
        const result = await fetchCompanySnapshot(selectedCompany.importyeti_key);
        if (!cancelled) {
          if (result && result.snapshot) {
            console.log("[Search] Snapshot loaded:", result.snapshot);
            setSnapshotData(result.snapshot);
          } else {
            console.warn("[Search] No snapshot data returned");
            setSnapshotData(null);
          }
        }
      } catch (error) {
        console.error('[Search] Failed to load snapshot:', error);
        if (!cancelled) {
          setSnapshotData(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingSnapshot(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();

    if (!query || query.length < 2) {
      toast({
        title: "Search query required",
        description: "Please enter at least 2 characters to search",
        variant: "destructive",
      });
      return;
    }

    if (!authReady) {
      toast({
        title: "Authentication required",
        description: "Please wait for authentication to complete",
        variant: "destructive",
      });
      return;
    }

    setSearching(true);
    setHasSearched(true);

    try {
      // Call real ImportYeti API via backend
      const response = await searchShippers({ q: query, page: 1, pageSize: 50 });

      if (response?.ok && response?.results) {
        const mappedResults = (response.results || []).map((result: any) => {
          const parsedAddress = result.address || "";
          const cityMatch = parsedAddress.match(/^([^,]+)/);

          // Parse ImportYeti date format (DD/MM/YYYY)
          const parsedDate = parseImportYetiDate(result.mostRecentShipment);

          return {
            id: result.key || `iy-${Date.now()}-${Math.random()}`,
            name: result.title || "Unknown Company",
            city: result.city || (cityMatch ? cityMatch[1] : "Unknown"),
            state: result.state || "",
            country: result.country || "United States",
            country_code: result.countryCode || "US",
            address: result.address || "",
            website: result.website || "",
            industry: "Import/Export",
            shipments: result.totalShipments || 0,
            shipments_12m: result.totalShipments || 0,
            teu_estimate: undefined,
            revenue_range: undefined,
            mode: undefined,
            last_shipment: parsedDate || new Date().toISOString().split('T')[0],
            status: (result.totalShipments || 0) > 0 ? "Active" as const : "Inactive" as const,
            frequency: (result.totalShipments || 0) > 1000 ? "High" as const : (result.totalShipments || 0) > 100 ? "Medium" as const : "Low" as const,
            trend: "flat" as const,
            top_origins: [],
            top_destinations: [],
            top_suppliers: Array.isArray(result.topSuppliers) ? result.topSuppliers : [],
            gemini_summary: `${result.title || "Company"} - Import/Export business`,
            risk_flags: [],
            importyeti_key: result.key,
            enrichment_status: 'pending' as const,
          };
        });

        setResults(mappedResults);

        if (mappedResults.length === 0) {
          toast({
            title: "No results found",
            description: `No companies found matching "${query}"`,
          });
        }
      } else {
        throw new Error("Search failed");
      }
    } catch (error: any) {
      console.error("Search error:", error);
      toast({
        title: "Search failed",
        description: error.message || "Unable to search companies. Please try again.",
        variant: "destructive",
      });
      // Safe set results with guard
      if (setResults) {
        setResults([]);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    setSearchQuery("");
    setResults([]);
    setHasSearched(false);
  };

  const saveToCommandCenter = async (company: MockCompany) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to save companies",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error("No valid session");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-company`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            company_data: {
              source: "importyeti",
              source_company_key: company.importyeti_key || company.id,
              name: company.name,
              domain: company.website,
              website: company.website,
              address_line1: company.address,
              city: company.city,
              state: company.state,
              country_code: company.country_code,
              shipments_12m: company.shipments_12m,
              teu_12m: company.teu_estimate,
              primary_mode: company.mode,
              revenue_range: company.revenue_range,
              most_recent_shipment_date: company.last_shipment,
              tags: [company.industry, company.frequency],
              risk_level: company.risk_flags.length > 0 ? "Medium" : "Low",
              raw_last_search: company,
            },
            stage: "prospect",
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save company");
      }

      toast({
        title: "Company saved",
        description: `${company.name} has been saved to your Command Center`,
      });

      setSavedCompanyIds(prev => [...prev, company.id]);
      setSelectedCompany(null);
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Save failed",
        description: error.message || "Could not save company",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getModeIcon = (mode: string) => {
    if (mode === "Ocean") return <Ship className="h-4 w-4" />;
    if (mode === "Air") return <Plane className="h-4 w-4" />;
    return <Package className="h-4 w-4" />;
  };

  const getTrendColor = (trend: string) => {
    if (trend === "up") return "text-green-600";
    if (trend === "down") return "text-red-600";
    return "text-slate-600";
  };

  const getFrequencyColor = (frequency: string) => {
    if (frequency === "High") return "bg-green-50 text-green-700 border-green-200";
    if (frequency === "Medium") return "bg-yellow-50 text-yellow-700 border-yellow-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  // CRITICAL: Block rendering until auth is ready
  if (!authReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Initializing...</h2>
          <p className="text-slate-600">Please wait while we prepare your search experience</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900">Company Search</h1>
            <p className="text-xs sm:text-sm md:text-base text-slate-600 mt-1">
              Search real import/export companies via ImportYeti
            </p>
          </div>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSearch}
          className="flex flex-col md:flex-row gap-2 md:gap-3"
        >
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search company name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 pr-12 h-12 md:h-14 text-sm md:text-base border-slate-300 focus:border-blue-500 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full md:w-auto px-6 md:px-8 h-12 md:h-14 bg-blue-600 hover:bg-blue-700 text-sm md:text-base"
            disabled={!authReady || searchQuery.length < 2 || searching}
          >
            {searching ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Searching...
              </>
            ) : !authReady ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Authenticating...
              </>
            ) : (
              "Search"
            )}
          </Button>
        </motion.form>

        {hasSearched && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-2"
            >
              <p className="text-xs sm:text-sm text-slate-600">
                {searching ? "Searching..." : (
                  <>
                    Showing <span className="font-semibold text-slate-900">{results.length}</span> companies
                  </>
                )}
              </p>
              <div className="hidden md:flex items-center gap-2">
                <span className="text-xs text-slate-500">View:</span>
                <div className="flex rounded-lg border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      viewMode === "grid"
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Grid3x3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      viewMode === "list"
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>

            {viewMode !== "list" ? (
          <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {results.map((company, index) => (
              <motion.div
                key={company.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
              >
                <Card className="group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-300 overflow-hidden h-full">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                {savedCompanyIds.includes(company.id) && (
                  <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10">
                    <Badge className="bg-blue-600 text-white border-0 shadow-sm text-xs">
                      <Bookmark className="h-3 w-3 mr-1 fill-white" />
                      Saved
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-3 md:pb-4 p-3 md:p-4">
                  <div className="flex items-start justify-between gap-2 md:gap-3">
                    <div className="flex items-start gap-2 md:gap-3 flex-1 min-w-0">
                      <CompanyAvatar
                        name={company.name}
                        logoUrl={getCompanyLogoUrl(company.website)}
                        size="md"
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1">
                          <CardTitle className="text-sm md:text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                            {company.name}
                          </CardTitle>
                          <span className="text-lg md:text-xl">{getCountryFlag(company.country_code)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs md:text-sm text-slate-600 mt-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                            {company.city}, {company.state}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className={`${getFrequencyColor(company.frequency)} text-xs`}>
                      {company.frequency}
                    </Badge>
                  </div>
                  <Badge variant="secondary" className="mt-2 w-fit text-xs">
                    {company.industry}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-3 md:space-y-4 p-3 md:p-4">
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                        <Package className="h-3 w-3" />
                        <span>Shipments (12m)</span>
                      </div>
                      <p className="text-lg md:text-xl font-bold text-slate-900">
                        {company.shipments_12m.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                        <TrendingUp className="h-3 w-3" />
                        <span>Est. TEU</span>
                      </div>
                      {company.teu_estimate !== undefined ? (
                        <p className="text-lg md:text-xl font-bold text-slate-900">
                          {company.teu_estimate === 0 ? '< 100' : company.teu_estimate.toLocaleString()}
                        </p>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="h-6 w-20 bg-slate-200 animate-pulse rounded"></div>
                          <span className="text-xs text-slate-400">Loading</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 md:pt-3 border-t border-slate-100 space-y-2">
                    {company.mode && (
                      <div className="flex items-center justify-between text-xs md:text-sm">
                        <span className="text-slate-600">Mode</span>
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          {getModeIcon(company.mode)}
                          {company.mode}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs md:text-sm">
                      <span className="text-slate-600">Suppliers</span>
                      {company.top_suppliers.length > 0 ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3 text-slate-500" />
                                <span className="font-semibold text-slate-900 text-xs truncate">
                                  {company.top_suppliers.slice(0, 1).map(s => s.split(' ')[0]).join(', ')}
                                </span>
                                {company.top_suppliers.length > 1 && (
                                  <Badge variant="secondary" className="text-xs py-0 px-1">
                                    +{company.top_suppliers.length - 1}
                                  </Badge>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-semibold mb-1 text-xs">Suppliers:</p>
                              <ul className="space-y-0.5">
                                {company.top_suppliers.map((supplier, idx) => (
                                  <li key={idx} className="text-xs">• {supplier}</li>
                                ))}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-slate-400">No data</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs md:text-sm">
                      <span className="text-slate-600">Last Shipment</span>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-900 text-xs">
                          {formatUserFriendlyDate(company.last_shipment)}
                        </span>
                        {(() => {
                          const badgeInfo = getDateBadgeInfo(company.last_shipment);
                          if (badgeInfo) {
                            return (
                              <Badge
                                variant="secondary"
                                className={`text-xs py-0 px-1.5 ${
                                  badgeInfo.color === 'green' ? 'bg-green-50 text-green-700 border-green-200' :
                                  badgeInfo.color === 'yellow' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                  'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {badgeInfo.label}
                              </Badge>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 md:pt-4 flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-xs md:text-sm h-9 md:h-10"
                      onClick={() => setSelectedCompany(company)}
                    >
                      <Eye className="h-3 md:h-4 w-3 md:w-4 mr-1" />
                      Details
                    </Button>
                    <Button
                      variant={savedCompanyIds.includes(company.id) ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => saveToCommandCenter(company)}
                      disabled={saving || savedCompanyIds.includes(company.id)}
                      className={`h-9 md:h-10 px-2 md:px-3 ${savedCompanyIds.includes(company.id) ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : ""}`}
                    >
                      {savedCompanyIds.includes(company.id) ? (
                        <Bookmark className="h-4 w-4 fill-current" />
                      ) : (
                        <BookmarkPlus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
        ) : viewMode === "list" ? (
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Shipments (12m)</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">TEU</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Mode</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Last Shipment</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((company, index) => (
                    <motion.tr
                      key={company.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{company.name}</div>
                            <div className="text-xs text-slate-500">{company.industry}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900">{company.city}, {company.state}</div>
                        <div className="text-xs text-slate-500">{company.country_code}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900">{company.shipments_12m.toLocaleString()}</div>
                      </td>
                      <td className="px-6 py-4">
                        {company.teu_estimate !== undefined ? (
                          <div className="text-sm font-semibold text-slate-900">
                            {company.teu_estimate === 0 ? '< 100' : company.teu_estimate.toLocaleString()}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="h-4 w-16 bg-slate-200 animate-pulse rounded"></div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {company.mode ? (
                          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                            {getModeIcon(company.mode)}
                            {company.mode}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm text-slate-900">
                            {formatUserFriendlyDate(company.last_shipment)}
                          </div>
                          {(() => {
                            const badgeInfo = getDateBadgeInfo(company.last_shipment);
                            if (badgeInfo) {
                              return (
                                <Badge
                                  variant="secondary"
                                  className={`text-xs py-0 px-1.5 ${
                                    badgeInfo.color === 'green' ? 'bg-green-50 text-green-700 border-green-200' :
                                    badgeInfo.color === 'yellow' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                    'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {badgeInfo.label}
                                </Badge>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className={getFrequencyColor(company.frequency)}>
                          {company.frequency}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCompany(company)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => saveToCommandCenter(company)}
                            disabled={saving || savedCompanyIds.includes(company.id)}
                            className={savedCompanyIds.includes(company.id) ? "text-blue-600" : ""}
                          >
                            {savedCompanyIds.includes(company.id) ? (
                              <Bookmark className="h-4 w-4 fill-current" />
                            ) : (
                              <BookmarkPlus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

          {!searching && results.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <SearchIcon className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No companies found
              </h3>
              <p className="text-slate-600">
                Try adjusting your search query
              </p>
            </motion.div>
          )}
          </>
        )}

        {!hasSearched && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
              <SearchIcon className="h-10 w-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              Start Your Search
            </h3>
            <p className="text-slate-600 max-w-md mx-auto">
              Enter a company name, city, or industry to discover import/export companies
            </p>
          </motion.div>
        )}

        <AnimatePresence>
          {selectedCompany && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedCompany(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-4xl max-h-[85vh] md:max-h-[90vh] overflow-auto bg-white rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 md:px-8 py-4 md:py-6">
                  <div className="flex items-start justify-between gap-3 md:gap-4">
                    <div className="flex items-start gap-3 md:gap-4 flex-1 min-w-0">
                      <CompanyAvatar
                        name={selectedCompany.name}
                        logoUrl={getCompanyLogoUrl(selectedCompany.website)}
                        size="lg"
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-xl md:text-2xl font-bold text-slate-900 flex-1 min-w-0">{selectedCompany.name}</h2>
                          <span className="text-2xl md:text-3xl flex-shrink-0 whitespace-nowrap">{getCountryFlag(selectedCompany.country_code)}</span>
                        </div>
                        <div className="space-y-1 text-xs md:text-sm">
                          <div className="flex items-start gap-2 text-slate-600">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedCompany.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start gap-2 hover:text-blue-600 transition-colors group"
                            >
                              <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
                              <span className="line-clamp-2 flex-1">{selectedCompany.address}</span>
                              <ExternalLink className="h-3 w-3 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                          </div>
                          {selectedCompany.website && (
                            <div className="flex items-center gap-2 text-slate-600">
                              <Globe className="h-4 w-4 flex-shrink-0" />
                              <a
                                href={`https://${selectedCompany.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-blue-600 transition-colors truncate"
                              >
                                {selectedCompany.website}
                                <ExternalLink className="h-3 w-3 inline ml-1" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          selectedCompany.status === "Active"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {selectedCompany.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedCompany(null)}
                        className="rounded-full h-8 w-8 md:h-10 md:w-10"
                      >
                        <X className="h-4 w-4 md:h-5 md:w-5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 120px)', WebkitOverflowScrolling: 'touch' }}>
                  <section>
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Package className="h-5 w-5 text-blue-600" />
                      Logistics KPIs
                      {loadingSnapshot && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                    </h3>
                    {loadingSnapshot ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {['Total TEU', 'FCL', 'LCL', 'Est. Spend'].map((label, idx) => (
                          <div key={idx} className="bg-slate-50 rounded-xl p-3 md:p-4 border border-slate-200">
                            <div className="flex items-center gap-1 text-xs text-slate-600 mb-1">
                              {idx === 3 ? <DollarSign className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                              <span>{label}</span>
                            </div>
                            <div className="h-6 md:h-8 w-20 bg-slate-200 animate-pulse rounded mt-1"></div>
                          </div>
                        ))}
                      </div>
                    ) : snapshotData ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-50 rounded-xl p-3 md:p-4 border border-slate-200">
                          <p className="flex items-center gap-1 text-xs text-slate-600 mb-1">
                            <Package className="h-3 w-3" />
                            Total TEU
                          </p>
                          <p className="text-lg md:text-2xl font-bold text-slate-900">
                            {snapshotData.total_teu.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 md:p-4 border border-slate-200">
                          <p className="flex items-center gap-1 text-xs text-slate-600 mb-1">
                            <Ship className="h-3 w-3" />
                            FCL
                          </p>
                          <p className="text-lg md:text-2xl font-bold text-slate-900">
                            {snapshotData.fcl_count.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 md:p-4 border border-slate-200">
                          <p className="flex items-center gap-1 text-xs text-slate-600 mb-1">
                            <Package className="h-3 w-3" />
                            LCL
                          </p>
                          <p className="text-lg md:text-2xl font-bold text-slate-900">
                            {snapshotData.lcl_count.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 md:p-4 border border-slate-200">
                          <p className="flex items-center gap-1 text-xs text-slate-600 mb-1">
                            <DollarSign className="h-3 w-3" />
                            Est. Spend
                          </p>
                          <p className="text-lg md:text-2xl font-bold text-blue-600">
                            {formatCurrency(snapshotData.est_spend)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: 'Total TEU', value: '0', icon: Package },
                          { label: 'FCL', value: '0', icon: Ship },
                          { label: 'LCL', value: '0', icon: Package },
                          { label: 'Est. Spend', value: '$0', icon: DollarSign }
                        ].map((item, idx) => (
                          <div key={idx} className="bg-slate-50 rounded-xl p-3 md:p-4 border border-slate-200">
                            <p className="flex items-center gap-1 text-xs text-slate-600 mb-1">
                              <item.icon className="h-3 w-3" />
                              {item.label}
                            </p>
                            <p className="text-lg md:text-2xl font-bold text-slate-400">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-base md:text-lg font-bold text-slate-900 mb-3 md:mb-4 flex items-center gap-2">
                      <Globe className="h-5 w-5 text-blue-600" />
                      Trade Routes
                    </h3>
                    {loadingSnapshot ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        {['Origins', 'Destinations'].map((title, colIdx) => (
                          <div key={colIdx}>
                            <p className="text-xs md:text-sm font-semibold text-slate-700 mb-2">{title}</p>
                            <ul className="space-y-1.5 md:space-y-2">
                              {[0, 1, 2].map((idx) => (
                                <li key={idx} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 flex-1">
                                    <div className={`w-6 h-6 rounded-full ${colIdx === 0 ? 'bg-blue-100' : 'bg-green-100'} flex items-center justify-center text-xs font-bold`}>
                                      {idx + 1}
                                    </div>
                                    <div className="h-3 w-24 bg-slate-200 animate-pulse rounded"></div>
                                  </div>
                                  <div className="h-3 w-16 bg-slate-200 animate-pulse rounded ml-2"></div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : snapshotData && snapshotData.top_ports && snapshotData.top_ports.length > 0 ? (
                      <div>
                        <p className="text-xs md:text-sm font-semibold text-slate-700 mb-2">Top Ports</p>
                        <ul className="space-y-1.5 md:space-y-2">
                          {snapshotData.top_ports.slice(0, 5).map((portData, idx) => (
                            <li key={idx} className="flex items-center justify-between text-xs md:text-sm">
                              <div className="flex items-center gap-2 flex-1">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="text-slate-700 truncate">{portData.port}</span>
                              </div>
                              <span className="text-slate-500 ml-2 flex-shrink-0">{portData.count}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-slate-500 text-sm">
                        No trade route data available
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-base md:text-lg font-bold text-slate-900 mb-3 md:mb-4 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-blue-600" />
                      Shipment Trend
                    </h3>
                    {snapshotData ? (
                      <div className={`bg-gradient-to-r rounded-xl p-4 md:p-6 border ${
                        snapshotData.trend === 'up'
                          ? 'from-green-50 to-green-100 border-green-200'
                          : snapshotData.trend === 'down'
                          ? 'from-red-50 to-red-100 border-red-200'
                          : 'from-blue-50 to-blue-100 border-blue-200'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                              snapshotData.trend === 'up'
                                ? 'bg-green-200'
                                : snapshotData.trend === 'down'
                                ? 'bg-red-200'
                                : 'bg-blue-200'
                            }`}>
                              <TrendingUp className={`h-6 w-6 ${
                                snapshotData.trend === 'up'
                                  ? 'text-green-600'
                                  : snapshotData.trend === 'down'
                                  ? 'text-red-600'
                                  : 'text-blue-600'
                              }`} />
                            </div>
                            <div>
                              <p className="text-xs md:text-sm text-slate-600">Recent Trend</p>
                              <p className="text-base md:text-lg font-bold text-slate-900">
                                {snapshotData.trend === 'up' ? '↑ Growing' : snapshotData.trend === 'down' ? '↓ Declining' : '→ Stable'}
                              </p>
                            </div>
                          </div>
                          {snapshotData.last_shipment_date && (
                            <div className="text-right">
                              <p className="text-xs md:text-sm text-slate-600">Last Shipment</p>
                              <p className="text-base md:text-lg font-bold text-slate-900">
                                {formatUserFriendlyDate(snapshotData.last_shipment_date)}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className={`h-1 rounded-full overflow-hidden ${
                          snapshotData.trend === 'up'
                            ? 'bg-green-200'
                            : snapshotData.trend === 'down'
                            ? 'bg-red-200'
                            : 'bg-blue-200'
                        }`}>
                          <div className={`h-full bg-gradient-to-r ${
                            snapshotData.trend === 'up'
                              ? 'from-green-400 to-green-600'
                              : snapshotData.trend === 'down'
                              ? 'from-red-400 to-red-600'
                              : 'from-blue-400 to-blue-600'
                          }`} style={{
                            width: snapshotData.trend === 'up' ? '75%' : snapshotData.trend === 'down' ? '35%' : '50%'
                          }}></div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-slate-500 text-sm">
                        No trend data available
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Ship className="h-5 w-5 text-blue-600" />
                      Shipment Summary
                    </h3>
                    {snapshotData ? (
                      <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div className="text-center">
                            <p className="text-xs text-slate-600 mb-1">Total Shipments</p>
                            <p className="text-2xl font-bold text-slate-900">{snapshotData.total_shipments.toLocaleString()}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-slate-600 mb-1">Last 12 Months</p>
                            <p className="text-2xl font-bold text-blue-600">{snapshotData.shipments_last_12m.toLocaleString()}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-slate-600 mb-1">Average TEU</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {snapshotData.total_shipments > 0
                                ? (snapshotData.total_teu / snapshotData.total_shipments).toFixed(1)
                                : '0'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <div className="flex items-center justify-center gap-6 text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-blue-500 rounded"></div>
                              <span>FCL: {snapshotData.fcl_count}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-green-500 rounded"></div>
                              <span>LCL: {snapshotData.lcl_count}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        No shipment data available
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-blue-600" />
                      AI Insights
                    </h3>
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                      <p className="text-slate-700 leading-relaxed">
                        {selectedCompany.gemini_summary}
                      </p>
                    </div>
                    {selectedCompany.risk_flags.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold text-slate-700 mb-2">Risk Flags</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedCompany.risk_flags.map((flag, idx) => (
                            <Badge key={idx} variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                </div>

                <div className="sticky bottom-0 bg-white border-t border-slate-200 px-8 py-4 flex gap-3">
                  <Button
                    className="flex-1"
                    variant={selectedCompany && savedCompanyIds.includes(selectedCompany.id) ? "secondary" : "default"}
                    onClick={() => selectedCompany && saveToCommandCenter(selectedCompany)}
                    disabled={saving || (selectedCompany && savedCompanyIds.includes(selectedCompany.id))}
                  >
                    {selectedCompany && savedCompanyIds.includes(selectedCompany.id) ? (
                      <>
                        <Bookmark className="h-4 w-4 mr-2 fill-current" />
                        Saved to Command Center
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="h-4 w-4 mr-2" />
                        {saving ? "Saving..." : "Save to Command Center"}
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedCompany(null)}>
                    Close
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
