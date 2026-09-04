import React from 'react';
import { motion } from 'framer-motion';
import { Command, Briefcase, FileText } from 'lucide-react';
import { springs } from '@/lib/motion';

interface CommandCenterHeaderProps {
  userName?: string;
  companiesCount?: number;
  onGenerateBrief?: () => void;
  onExportPDF?: () => void;
}

export default function CommandCenterHeader({
  userName = 'User',
  companiesCount = 0,
  onGenerateBrief,
  onExportPDF,
}: CommandCenterHeaderProps) {
  const firstName = userName?.split(' ')[0] || userName || 'there';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.default}
      className="mb-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-600/25 ring-1 ring-white/40">
            <Briefcase className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-slate-900">
              Command Center
            </h1>
            {/* Only show an onboarding nudge when nothing is saved yet. */}
            <p className="font-body text-[13px] text-slate-500">
              {companiesCount > 0
                ? `${companiesCount.toLocaleString()} saved compan${companiesCount === 1 ? 'y' : 'ies'}`
                : 'Save companies from search to get started'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onExportPDF && (
            <button
              type="button"
              onClick={onExportPDF}
              className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 backdrop-blur transition hover:border-slate-300 hover:bg-white active:scale-[0.97] motion-reduce:active:scale-100"
            >
              <FileText className="h-4 w-4 text-slate-500 transition-colors group-hover:text-blue-600" />
              Export PDF
            </button>
          )}

          {onGenerateBrief && (
            <button
              type="button"
              onClick={onGenerateBrief}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.97] motion-reduce:active:scale-100"
            >
              <Command className="h-4 w-4" />
              Generate Brief
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
