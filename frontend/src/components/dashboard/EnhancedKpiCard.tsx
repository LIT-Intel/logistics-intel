import React from 'react';
import { Link } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface EnhancedKpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  iconColor?: string;
  iconBg?: string;
  href: string;
  delay?: number;
  live?: boolean;
}

export default function EnhancedKpiCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor = '#3B82F6',
  iconBg,
  href,
  delay = 0,
  live = false,
}: EnhancedKpiCardProps) {
  const bg = iconBg || iconColor + '18';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Link
        to={href}
        className="block group"
      >
        <div
          className="rounded-[14px] border border-slate-200 p-4 transition-all duration-200 hover:shadow-md hover:border-blue-300"
          style={{
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
            boxShadow: '0 8px 30px rgba(15,23,42,0.06)',
          }}
        >
          <div className="flex items-start justify-between mb-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: bg }}
            >
              <Icon className="w-4 h-4" style={{ color: iconColor }} />
            </div>
            {live && (
              <span className="lit-live-pill">
                <span className="lit-live-dot" />
                Live
              </span>
            )}
          </div>

          <div
            className="text-[22px] font-bold leading-none mb-1 group-hover:text-blue-600 transition-colors"
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.01em', color: '#0F172A' }}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>

          <div
            className="text-[11px] font-semibold text-slate-700 mt-0.5"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {label}
          </div>

          {sub && (
            <div
              className="text-[11px] text-slate-400 mt-0.5"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {sub}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
