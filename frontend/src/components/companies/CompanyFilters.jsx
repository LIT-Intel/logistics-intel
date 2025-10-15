import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Filter, X } from 'lucide-react';

export default function CompanyFilters({ filters, onFilterChange }) {
  const handleFilterUpdate = (key, value) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const handleClearFilters = () => {
    onFilterChange({
      status: "all",
      industry: "all"
    });
  };

  const activeFiltersCount = Object.values(filters).filter(v => v && v !== "all").length;

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Status Filter */}
      <Select value={filters.status} onValueChange={(value) => handleFilterUpdate('status', value)}>
        <SelectTrigger className="w-full sm:w-40 bg-gray-50 border-0">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="enriched">Enriched</SelectItem>
          <SelectItem value="pending">Pending Enrichment</SelectItem>
          <SelectItem value="failed">Failed Enrichment</SelectItem>
        </SelectContent>
      </Select>

      {/* Industry Filter */}
      <Select value={filters.industry} onValueChange={(value) => handleFilterUpdate('industry', value)}>
        <SelectTrigger className="w-full sm:w-40 bg-gray-50 border-0">
          <SelectValue placeholder="All Industries" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Industries</SelectItem>
          <SelectItem value="Manufacturing">Manufacturing</SelectItem>
          <SelectItem value="Logistics">Logistics</SelectItem>
          <SelectItem value="Retail">Retail</SelectItem>
          <SelectItem value="Automotive">Automotive</SelectItem>
          <SelectItem value="Electronics">Electronics</SelectItem>
          <SelectItem value="Food & Beverage">Food & Beverage</SelectItem>
          <SelectItem value="Chemicals">Chemicals</SelectItem>
          <SelectItem value="Textiles">Textiles</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {activeFiltersCount > 0 && (
        <Button
          variant="ghost"
          onClick={handleClearFilters}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
        >
          <X className="w-4 h-4" />
          Clear
        </Button>
      )}

      {/* Filter indicator */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter className="w-4 h-4" />
          <span>{activeFiltersCount} filter{activeFiltersCount !== 1 ? 's' : ''} active</span>
        </div>
      )}
    </div>
  );
}