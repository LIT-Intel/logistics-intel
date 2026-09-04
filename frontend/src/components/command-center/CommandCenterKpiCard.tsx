import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { springs } from '@/lib/motion';

interface CommandCenterKpiCardProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  color?: 'blue' | 'emerald' | 'amber' | 'slate' | 'indigo';
  index?: number;
  onClick?: () => void;
}

const colorClasses = {
  blue: {
    bg: 'from-blue-50 to-blue-100',
    border: 'border-blue-200',
    icon: 'text-blue-600',
    iconBg: 'bg-white/80',
    hover: 'group-hover:border-blue-300',
  },
  emerald: {
    bg: 'from-emerald-50 to-emerald-100',
    border: 'border-emerald-200',
    icon: 'text-emerald-600',
    iconBg: 'bg-white/80',
    hover: 'group-hover:border-emerald-300',
  },
  amber: {
    bg: 'from-amber-50 to-amber-100',
    border: 'border-amber-200',
    icon: 'text-amber-600',
    iconBg: 'bg-white/80',
    hover: 'group-hover:border-amber-300',
  },
  slate: {
    bg: 'from-slate-50 to-slate-100',
    border: 'border-slate-200',
    icon: 'text-slate-600',
    iconBg: 'bg-white/80',
    hover: 'group-hover:border-slate-300',
  },
  indigo: {
    bg: 'from-indigo-50 to-indigo-100',
    border: 'border-indigo-200',
    icon: 'text-indigo-600',
    iconBg: 'bg-white/80',
    hover: 'group-hover:border-indigo-300',
  },
};

export default function CommandCenterKpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color = 'blue',
  index = 0,
  onClick,
}: CommandCenterKpiCardProps) {
  const colors = colorClasses[color];
  const Component = onClick ? 'button' : 'div';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      // Apple §4: shared critically-damped spring instead of a fixed-duration
      // tween, so hover-lift is interruptible and consistent app-wide.
      transition={{ ...springs.default, delay: index * 0.05 }}
      whileHover={{ y: -2, transition: springs.snappy }}
      className="group"
    >
      <Component
        onClick={onClick}
        className={`w-full text-left bg-gradient-to-br ${colors.bg} rounded-2xl border ${colors.border} ${colors.hover} shadow-sm hover:shadow-md transition-all duration-200 p-5 ${onClick ? 'active:scale-[0.98] motion-reduce:active:scale-100' : ''}`}
      >
        <div className="flex items-start justify-between mb-3">
          <motion.div
            whileHover={{ scale: 1.06 }}
            className={`h-10 w-10 rounded-xl ${colors.iconBg} flex items-center justify-center ring-1 ring-black/5 backdrop-blur-sm ${colors.icon}`}
          >
            <Icon className="h-5 w-5" />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 + index * 0.05 }}
        >
          <div className="font-display mb-1 text-[26px] font-bold leading-none tracking-tight text-slate-900 transition-colors group-hover:text-blue-600">
            {value}
          </div>
          <div className="font-body text-[13px] font-semibold text-slate-600">{label}</div>
          {subtitle && (
            <div className="font-body mt-1 text-[11.5px] text-slate-500">{subtitle}</div>
          )}
        </motion.div>
      </Component>
    </motion.div>
  );
}
