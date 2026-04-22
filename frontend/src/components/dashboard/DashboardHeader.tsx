import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Send, FileText } from 'lucide-react';

interface DashboardHeaderProps {
  userName?: string;
}

const ACTIONS = [
  { icon: Building2, label: 'Add Company',     href: '/app/search'    },
  { icon: Send,      label: 'Start Campaign',   href: '/app/campaigns' },
  { icon: FileText,  label: 'Generate Quote',   href: '/app/rfp-studio'},
];

export default function DashboardHeader({ userName }: DashboardHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1"
    >
      <div>
        <h1
          className="text-xl font-bold tracking-tight text-slate-900 leading-tight"
          style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}
        >
          Dashboard
        </h1>
        <p
          className="text-sm text-slate-500 mt-0.5"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Real-time shipment intelligence and opportunity signals
          {userName && (
            <span className="text-slate-400"> · {userName}</span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {ACTIONS.map(({ icon: Icon, label, href }) => (
          <Link
            key={label}
            to={href}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <Icon className="w-3 h-3" />
            {label}
          </Link>
        ))}
      </div>
    </motion.div>
  );
}
