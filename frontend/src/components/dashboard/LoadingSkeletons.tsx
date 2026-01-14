import React from 'react';
import { motion } from 'framer-motion';

export function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="h-10 w-64 bg-slate-200 rounded-lg mb-2"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: 0.1 }}
          className="h-5 w-48 bg-slate-100 rounded"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
            className="h-48 bg-white rounded-xl border border-slate-200 overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-slate-100 animate-pulse" />
                <div className="w-16 h-6 rounded-lg bg-slate-100 animate-pulse" />
              </div>
              <div className="space-y-3">
                <div className="h-8 w-20 bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
              </div>
              <div className="mt-4 h-10 bg-slate-50 rounded animate-pulse" />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="h-96 bg-white rounded-xl border border-slate-200 animate-pulse"
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="h-96 bg-white rounded-xl border border-slate-200 animate-pulse"
          />
        </div>
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="h-96 bg-white rounded-xl border border-slate-200 animate-pulse"
          />
        </div>
      </div>
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="h-48 bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-6 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100" />
          <div className="w-16 h-6 rounded-lg bg-slate-100" />
        </div>
        <div className="space-y-3">
          <div className="h-8 w-20 bg-slate-200 rounded" />
          <div className="h-4 w-32 bg-slate-100 rounded" />
        </div>
        <div className="mt-4 h-10 bg-slate-50 rounded" />
      </div>
    </div>
  );
}
