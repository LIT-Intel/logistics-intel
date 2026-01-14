import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Rocket } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  href: string;
}

interface GettingStartedChecklistProps {
  savedCompaniesCount?: number;
  campaignsCount?: number;
}

export default function GettingStartedChecklist({
  savedCompaniesCount = 0,
  campaignsCount = 0,
}: GettingStartedChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([
    {
      id: '1',
      label: 'Run your first search',
      completed: false,
      href: '/app/search',
    },
    {
      id: '2',
      label: 'Save 5 companies',
      completed: savedCompaniesCount >= 5,
      href: '/app/command-center',
    },
    {
      id: '3',
      label: 'Create your first campaign',
      completed: campaignsCount > 0,
      href: '/app/campaigns',
    },
    {
      id: '4',
      label: 'Generate an RFP',
      completed: false,
      href: '/app/rfp-studio',
    },
    {
      id: '5',
      label: 'Connect your email account',
      completed: false,
      href: '/app/settings',
    },
  ]);

  useEffect(() => {
    const hasSearched = localStorage.getItem('lit_has_searched') === 'true';
    const hasGeneratedRfp = localStorage.getItem('lit_rfps') && JSON.parse(localStorage.getItem('lit_rfps') || '[]').length > 0;

    setItems(prev => prev.map(item => {
      if (item.id === '1') return { ...item, completed: hasSearched };
      if (item.id === '2') return { ...item, completed: savedCompaniesCount >= 5 };
      if (item.id === '3') return { ...item, completed: campaignsCount > 0 };
      if (item.id === '4') return { ...item, completed: hasGeneratedRfp };
      return item;
    }));
  }, [savedCompaniesCount, campaignsCount]);

  const completedCount = items.filter(item => item.completed).length;
  const progress = (completedCount / items.length) * 100;
  const isComplete = completedCount === items.length;

  if (isComplete) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-blue-200 bg-white/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Getting Started</h2>
              <p className="text-sm text-slate-600">Complete these steps to get the most out of LIT</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{completedCount}/{items.length}</div>
            <div className="text-xs text-slate-600">Completed</div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-slate-700">Progress</span>
            <span className="font-semibold text-blue-600">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
            />
          </div>
        </div>

        <div className="space-y-2">
          <AnimatePresence>
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                <Link
                  to={item.href}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all group ${
                    item.completed
                      ? 'bg-white/70 border border-green-200'
                      : 'bg-white/70 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      item.completed
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-200 text-slate-400 group-hover:bg-blue-500 group-hover:text-white'
                    }`}
                  >
                    {item.completed ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-semibold">{index + 1}</span>
                    )}
                  </div>
                  <span
                    className={`flex-1 font-medium transition-colors ${
                      item.completed
                        ? 'text-slate-600 line-through'
                        : 'text-slate-900 group-hover:text-blue-700'
                    }`}
                  >
                    {item.label}
                  </span>
                  {!item.completed && (
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                  )}
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
