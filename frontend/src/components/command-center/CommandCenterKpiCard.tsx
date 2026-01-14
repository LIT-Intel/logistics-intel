import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

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
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -2 }}
      className="group"
    >
      <Component
        onClick={onClick}
        className={`w-full text-left bg-gradient-to-br ${colors.bg} rounded-xl border ${colors.border} ${colors.hover} shadow-sm hover:shadow-md transition-all duration-200 p-5`}
      >
        <div className="flex items-start justify-between mb-3">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            className={`w-10 h-10 rounded-lg ${colors.iconBg} backdrop-blur-sm flex items-center justify-center ${colors.icon}`}
          >
            <Icon className="w-5 h-5" />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 + index * 0.05 }}
        >
          <div className="text-2xl font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
            {value}
          </div>
          <div className="text-sm font-medium text-slate-600">{label}</div>
          {subtitle && (
            <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
          )}
        </motion.div>
      </Component>
    </motion.div>
  );
}
