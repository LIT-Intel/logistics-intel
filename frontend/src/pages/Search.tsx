import React, { useState } from "react";
import { Search as SearchIcon, Building2, MapPin, TrendingUp, Package, Ship, Plane, Calendar, Globe, X, BookmarkPlus, Eye, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";

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
  teu_estimate: number;
  revenue_range: string;
  mode: string;
  last_shipment: string;
  status: "Active" | "Inactive";
  frequency: "High" | "Medium" | "Low";
  trend: "up" | "flat" | "down";
  top_origins: string[];
  top_destinations: string[];
  gemini_summary: string;
  risk_flags: string[];
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
    gemini_summary: "Large-scale distribution center handling diverse product categories. Strong relationships with multiple Chinese manufacturers. Expansion planned for 2024.",
    risk_flags: [],
  },
];

export default function SearchPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState(MOCK_COMPANIES);
  const [selectedCompany, setSelectedCompany] = useState<MockCompany | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setResults(MOCK_COMPANIES);
      return;
    }
    const filtered = MOCK_COMPANIES.filter((company) =>
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.industry.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setResults(filtered);
  };

  const handleClear = () => {
    setSearchQuery("");
    setResults(MOCK_COMPANIES);
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
      const { data: existingCompany, error: checkError } = await supabase
        .from("companies")
        .select("company_id")
        .eq("company_id", company.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (!existingCompany) {
        const { error: insertError } = await supabase.from("companies").insert({
          company_id: company.id,
          name: company.name,
          website: company.website,
          address: company.address,
          country: company.country,
          country_code: company.country_code,
          industry: company.industry,
          phone: null,
          total_shipments: company.shipments,
          shipments_12m: company.shipments_12m,
          most_recent_shipment: company.last_shipment,
          top_suppliers: [],
          raw_data: company,
          source: "search",
          last_fetched_at: new Date().toISOString(),
        });

        if (insertError) throw insertError;
      }

      const { error: savedError } = await supabase
        .from("saved_companies")
        .upsert({
          user_id: user.id,
          company_id: company.id,
          stage: "prospect",
          saved_at: new Date().toISOString(),
          last_viewed_at: new Date().toISOString(),
        }, {
          onConflict: "user_id,company_id",
        });

      if (savedError) throw savedError;

      const { error: enrichmentError } = await supabase
        .from("company_enrichment")
        .upsert({
          company_id: company.id,
          enrichment_type: "gemini",
          enrichment_data: {
            summary: company.gemini_summary,
            risk_flags: company.risk_flags,
            top_origins: company.top_origins,
            top_destinations: company.top_destinations,
            trend: company.trend,
          },
          model_version: "mock-v1",
          enriched_at: new Date().toISOString(),
        }, {
          onConflict: "company_id,enrichment_type",
        });

      if (enrichmentError) throw enrichmentError;

      toast({
        title: "Company saved",
        description: `${company.name} has been saved to your Command Center`,
      });

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Company Search</h1>
            <p className="text-slate-600 mt-1">
              Discover and analyze logistics companies
            </p>
          </div>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <SearchIcon className="h-3 w-3 mr-1" />
            Mock Data Mode
          </Badge>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSearch}
          className="flex gap-3"
        >
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by company name, city, or industry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 pr-12 h-14 text-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500"
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
          <Button type="submit" size="lg" className="px-8 h-14 bg-blue-600 hover:bg-blue-700">
            Search
          </Button>
        </motion.form>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-between"
        >
          <p className="text-sm text-slate-600">
            Showing <span className="font-semibold text-slate-900">{results.length}</span> companies
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {results.map((company, index) => (
            <motion.div
              key={company.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
            >
              <Card className="group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                          {company.name}
                        </CardTitle>
                        <div className="flex items-center gap-1 text-sm text-slate-600 mt-1">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">
                            {company.city}, {company.state}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className={getFrequencyColor(company.frequency)}>
                      {company.frequency}
                    </Badge>
                  </div>
                  <Badge variant="secondary" className="mt-2 w-fit">
                    {company.industry}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                        <Package className="h-3 w-3" />
                        <span>Shipments (12m)</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900">
                        {company.shipments_12m.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                        <TrendingUp className="h-3 w-3" />
                        <span>Est. TEU</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900">
                        {company.teu_estimate.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Primary Mode</span>
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                        {getModeIcon(company.mode)}
                        {company.mode}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Revenue Range</span>
                      <span className="font-semibold text-slate-900">{company.revenue_range}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Last Shipment</span>
                      <span className="font-semibold text-slate-900">
                        {new Date(company.last_shipment).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 bg-slate-900 hover:bg-slate-800"
                      onClick={() => setSelectedCompany(company)}
                    >
                      <Eye className="h-4 w-4 mr-1.5" />
                      View Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveToCommandCenter(company)}
                      disabled={saving}
                    >
                      <BookmarkPlus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {results.length === 0 && (
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
                className="w-full max-w-4xl max-h-[90vh] overflow-auto bg-white rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-8 py-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                        <Building2 className="h-8 w-8" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-2xl font-bold text-slate-900">{selectedCompany.name}</h2>
                        <p className="text-slate-600 mt-1 flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {selectedCompany.address}
                        </p>
                        {selectedCompany.website && (
                          <a
                            href={`https://${selectedCompany.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 text-sm mt-1 inline-flex items-center gap-1"
                          >
                            <Globe className="h-3.5 w-3.5" />
                            {selectedCompany.website}
                            <ArrowUpRight className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          selectedCompany.status === "Active"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }
                      >
                        {selectedCompany.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedCompany(null)}
                        className="rounded-full"
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-8 space-y-8">
                  <section>
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Package className="h-5 w-5 text-blue-600" />
                      Logistics KPIs
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-xs text-slate-600 mb-1">Total Shipments</p>
                        <p className="text-2xl font-bold text-slate-900">
                          {selectedCompany.shipments.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-xs text-slate-600 mb-1">Last 12 Months</p>
                        <p className="text-2xl font-bold text-slate-900">
                          {selectedCompany.shipments_12m.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-xs text-slate-600 mb-1">Est. TEU</p>
                        <p className="text-2xl font-bold text-slate-900">
                          {selectedCompany.teu_estimate.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-xs text-slate-600 mb-1">Trend</p>
                        <p className={`text-2xl font-bold capitalize ${getTrendColor(selectedCompany.trend)}`}>
                          {selectedCompany.trend === "up" && "↑ "}
                          {selectedCompany.trend === "down" && "↓ "}
                          {selectedCompany.trend}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Globe className="h-5 w-5 text-blue-600" />
                      Trade Routes
                    </h3>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-2">Top Origin Ports</p>
                        <ul className="space-y-2">
                          {selectedCompany.top_origins.map((origin, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                                {idx + 1}
                              </span>
                              {origin}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-2">Top Destination Ports</p>
                        <ul className="space-y-2">
                          {selectedCompany.top_destinations.map((dest, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                              <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
                                {idx + 1}
                              </span>
                              {dest}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
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
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    onClick={() => saveToCommandCenter(selectedCompany)}
                    disabled={saving}
                  >
                    <BookmarkPlus className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save to Command Center"}
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
