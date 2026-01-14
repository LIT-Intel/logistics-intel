import React, { useState } from "react";
import { Search as SearchIcon, Building2, MapPin, TrendingUp, Package, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MOCK_COMPANIES = [
  {
    id: "1",
    name: "Acme Logistics Inc",
    city: "Los Angeles",
    state: "CA",
    country: "United States",
    shipments: 1234,
    revenue: "$2.5M",
    mode: "Ocean",
  },
  {
    id: "2",
    name: "Global Trade Partners",
    city: "New York",
    state: "NY",
    country: "United States",
    shipments: 856,
    revenue: "$1.8M",
    mode: "Air",
  },
  {
    id: "3",
    name: "Pacific Shipping Co",
    city: "Seattle",
    state: "WA",
    country: "United States",
    shipments: 2341,
    revenue: "$4.2M",
    mode: "Ocean",
  },
  {
    id: "4",
    name: "Express Freight Services",
    city: "Chicago",
    state: "IL",
    country: "United States",
    shipments: 567,
    revenue: "$980K",
    mode: "Air",
  },
];

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState(MOCK_COMPANIES);
  const [selectedCompany, setSelectedCompany] = useState(null);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setResults(MOCK_COMPANIES);
      return;
    }
    const filtered = MOCK_COMPANIES.filter((company) =>
      company.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setResults(filtered);
  };

  const handleClear = () => {
    setSearchQuery("");
    setResults(MOCK_COMPANIES);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Company Search</h1>
            <p className="text-gray-600 mt-1">
              Find and analyze companies (Mock Data Mode)
            </p>
          </div>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            Mock Data
          </Badge>
        </div>

        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 h-12 text-lg"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <Button type="submit" size="lg" className="px-8">
            Search
          </Button>
        </form>

        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing {results.length} companies
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.map((company) => (
              <Card
                key={company.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedCompany(company)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{company.name}</CardTitle>
                        <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                          <MapPin className="h-3 w-3" />
                          <span>
                            {company.city}, {company.state}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                        <Package className="h-3 w-3" />
                        <span>Shipments</span>
                      </div>
                      <p className="text-lg font-semibold">{company.shipments}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                        <TrendingUp className="h-3 w-3" />
                        <span>Revenue</span>
                      </div>
                      <p className="text-lg font-semibold">{company.revenue}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t">
                    <Badge variant="secondary">{company.mode}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {results.length === 0 && (
            <div className="text-center py-12">
              <SearchIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No companies found
              </h3>
              <p className="text-gray-600">
                Try adjusting your search query
              </p>
            </div>
          )}
        </div>

        {selectedCompany && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCompany(null)}
          >
            <Card
              className="max-w-2xl w-full max-h-[80vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{selectedCompany.name}</CardTitle>
                    <p className="text-gray-600 mt-1">
                      {selectedCompany.city}, {selectedCompany.state}, {selectedCompany.country}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedCompany(null)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Shipments</p>
                    <p className="text-2xl font-bold">{selectedCompany.shipments}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Est. Revenue</p>
                    <p className="text-2xl font-bold">{selectedCompany.revenue}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Primary Mode</p>
                    <Badge>{selectedCompany.mode}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Status</p>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button className="w-full" onClick={() => alert("Save feature coming soon!")}>
                    Save to Command Center
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
