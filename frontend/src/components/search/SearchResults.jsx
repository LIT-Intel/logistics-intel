
import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlertCircle, LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import CompanySearchCard from './CompanySearchCard';
import CompanySearchListItem from './CompanySearchListItem';

export default function SearchResults({
  searchResults,
  totalResults,
  isLoading,
  onCompanySelect,
  onSave,
  onStartOutreach,
  onDraftRFP,
  user,
  newShipperEvents,
  savedCompanyIds,
  savingCompanyId,
  viewMode,
  setViewMode,
  selectedId,
  currentPage,
  totalPages,
  onPageChange
}) {
  const hasResults = searchResults && searchResults.length > 0;

  return (
    <div>
      {/* Header with View Toggle and Pagination */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Search Results</h2>
          {!isLoading && (
            <p className="text-gray-500 text-sm mt-1">
              Found {Number(totalResults || 0).toLocaleString()} companies • Showing {searchResults?.length || 0} on this page
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            <Button
              size="sm"
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              onClick={() => setViewMode('grid')}
              className="h-8 px-3"
            >
              <LayoutGrid className="w-4 h-4 mr-1" />
              Cards
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              onClick={() => setViewMode('list')}
              className="h-8 px-3"
            >
              <List className="w-4 h-4 mr-1" />
              List
            </Button>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
                className="h-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-600 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isLoading}
                className="h-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className={`grid gap-4 md:gap-6 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl shadow-sm animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-16 bg-gray-200 rounded mb-4"></div>
              <div className="flex gap-2">
                <div className="h-8 bg-gray-200 rounded flex-1"></div>
                <div className="h-8 bg-gray-200 rounded flex-1"></div>
              </div>
            </div>
          ))}
        </div>
      ) : hasResults ? (
        <div className={`grid gap-4 md:gap-6 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
          <AnimatePresence>
            {searchResults.map((company) => {
              // FIX: Ensure consistent ID checking
              const companyId = company.company_id || company.id;
              const isSaving = savingCompanyId === companyId;
              const isSaved = savedCompanyIds.has(companyId);
              const isNew = newShipperEvents.includes(companyId);

              return viewMode === 'grid' ? (
                <CompanySearchCard
                  key={companyId}
                  company={company}
                  onSelect={onCompanySelect}
                  onSave={onSave}
                  isSaving={isSaving}
                  isSaved={isSaved}
                  isNew={isNew}
                  onStartOutreach={onStartOutreach}
                  onDraftRFP={onDraftRFP}
                  savingCompanyId={savingCompanyId}
                />
              ) : (
                <CompanySearchListItem
                  key={companyId}
                  company={company}
                  onSelect={onCompanySelect}
                  onSave={onSave}
                  isSaving={isSaving}
                  isSaved={isSaved}
                  isNew={isNew}
                  onStartOutreach={onStartOutreach}
                  onDraftRFP={onDraftRFP}
                  savingCompanyId={savingCompanyId}
                  selectedId={selectedId}
                />
              );
            })}
          </AnimatePresence>
          {/* Load More */}
          {currentPage < totalPages && (
            <div className="col-span-full flex justify-center mt-2">
              <Button variant="outline" onClick={() => onPageChange(currentPage + 1)} disabled={isLoading}>Load More</Button>
            </div>
          )}
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300"
        >
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No results found</h3>
          <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
            Try adjusting your search query or filters to find companies.
          </p>
        </motion.div>
      )}
    </div>
  );
}
