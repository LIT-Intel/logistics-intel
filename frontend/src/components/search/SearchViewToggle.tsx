import React from 'react';
import { Grid3x3, List } from 'lucide-react';
import { motion } from 'framer-motion';

type ViewMode = 'grid' | 'list';

interface SearchViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export default function SearchViewToggle({ viewMode, onViewModeChange }: SearchViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      <motion.button
        type="button"
        onClick={() => onViewModeChange('grid')}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`relative inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
          viewMode === 'grid'
            ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
        aria-label="Grid view"
      >
        <Grid3x3 className="h-4 w-4" />
        <span className="hidden sm:inline">Grid</span>
      </motion.button>
      <motion.button
        type="button"
        onClick={() => onViewModeChange('list')}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`relative inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
          viewMode === 'list'
            ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
        aria-label="List view"
      >
        <List className="h-4 w-4" />
        <span className="hidden sm:inline">List</span>
      </motion.button>
    </div>
  );
}
