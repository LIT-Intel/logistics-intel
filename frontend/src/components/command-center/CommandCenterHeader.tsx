import React from 'react';
import { motion } from 'framer-motion';
import { Command, Briefcase, FileText, Plus } from 'lucide-react';

interface CommandCenterHeaderProps {
  userName?: string;
  companiesCount?: number;
  onGenerateBrief?: () => void;
  onExportPDF?: () => void;
  onAddCompany?: () => void;
}

export default function CommandCenterHeader({
  userName = 'User',
  companiesCount = 0,
  onGenerateBrief,
  onExportPDF,
  onAddCompany,
}: CommandCenterHeaderProps) {
  const firstName = userName?.split(' ')[0] || userName || 'there';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            Command Center
            <motion.span
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
              transition={{
                duration: 0.6,
                delay: 0.3,
                ease: 'easeInOut',
              }}
            >
              <Briefcase className="w-7 h-7 text-blue-500" />
            </motion.span>
          </h1>
          <p className="text-slate-600">
            {companiesCount > 0
              ? `Manage ${companiesCount} saved ${companiesCount === 1 ? 'company' : 'companies'}, track shipments, and prep for calls`
              : 'Save companies from search to get started'
            }
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onAddCompany && (
            <motion.button
              onClick={onAddCompany}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all group"
            >
              <Plus className="w-4 h-4 text-slate-600 group-hover:text-blue-600 transition-colors" />
              <span className="text-sm font-medium text-slate-700">Add Company</span>
            </motion.button>
          )}

          {onExportPDF && (
            <motion.button
              onClick={onExportPDF}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all group"
            >
              <FileText className="w-4 h-4 text-slate-600 group-hover:text-blue-600 transition-colors" />
              <span className="text-sm font-medium text-slate-700">Export PDF</span>
            </motion.button>
          )}

          {onGenerateBrief && (
            <motion.button
              onClick={onGenerateBrief}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:shadow-md transition-all"
            >
              <Command className="w-4 h-4" />
              <span className="text-sm font-medium">Generate Brief</span>
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
