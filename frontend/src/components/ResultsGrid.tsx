import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CompanyCard from '@/pages/app/Search'; // will use exported CompanyCard type via props if needed

export default function ResultsGrid({ rows, renderCard }: { rows: any[]; renderCard: (row:any)=>React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
      <AnimatePresence>
        {rows.map((row) => (
          <motion.div key={row.company_id || row.company_name} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {renderCard(row)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

