import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Mail, FileText, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface QuickAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Search Companies',
    icon: Search,
    href: '/app/search',
    color: 'from-blue-500 to-blue-600',
  },
  {
    label: 'New Campaign',
    icon: Mail,
    href: '/app/campaigns',
    color: 'from-green-500 to-green-600',
  },
  {
    label: 'Generate RFP',
    icon: FileText,
    href: '/app/rfp-studio',
    color: 'from-purple-500 to-purple-600',
  },
];

export default function QuickActionsButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-20 right-0 space-y-3"
          >
            {QUICK_ACTIONS.map((action, index) => {
              const Icon = action.icon;
              return (
                <motion.div
                  key={action.href}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                >
                  <Link
                    to={action.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 bg-white rounded-full shadow-lg border border-slate-200 pr-5 pl-4 py-3 hover:shadow-xl transition-all group"
                  >
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${action.color} flex items-center justify-center text-white group-hover:scale-110 transition-transform`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-medium text-slate-900 whitespace-nowrap">
                      {action.label}
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white transition-all ${
          isOpen
            ? 'bg-slate-600 hover:bg-slate-700'
            : 'bg-gradient-to-br from-blue-600 to-indigo-700 hover:shadow-2xl'
        }`}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div
              key="plus"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Plus className="w-6 h-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
