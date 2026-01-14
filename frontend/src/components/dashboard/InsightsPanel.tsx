import React from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb, TrendingUp, AlertCircle, Zap, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface Insight {
  id: string;
  type: 'action' | 'trend' | 'opportunity' | 'alert';
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
}

interface InsightsPanelProps {
  insights?: Insight[];
}

const getInsightIcon = (type: Insight['type']) => {
  switch (type) {
    case 'action':
      return Zap;
    case 'trend':
      return TrendingUp;
    case 'opportunity':
      return Sparkles;
    case 'alert':
      return AlertCircle;
    default:
      return Lightbulb;
  }
};

const getInsightColor = (type: Insight['type']) => {
  switch (type) {
    case 'action':
      return {
        bg: 'from-blue-50 to-blue-100',
        text: 'text-blue-700',
        icon: 'text-blue-600',
        border: 'border-blue-200',
      };
    case 'trend':
      return {
        bg: 'from-emerald-50 to-emerald-100',
        text: 'text-emerald-700',
        icon: 'text-emerald-600',
        border: 'border-emerald-200',
      };
    case 'opportunity':
      return {
        bg: 'from-amber-50 to-amber-100',
        text: 'text-amber-700',
        icon: 'text-amber-600',
        border: 'border-amber-200',
      };
    case 'alert':
      return {
        bg: 'from-red-50 to-red-100',
        text: 'text-red-700',
        icon: 'text-red-600',
        border: 'border-red-200',
      };
    default:
      return {
        bg: 'from-slate-50 to-slate-100',
        text: 'text-slate-700',
        icon: 'text-slate-600',
        border: 'border-slate-200',
      };
  }
};

export default function InsightsPanel({ insights = [] }: InsightsPanelProps) {
  const defaultInsights: Insight[] = [
    {
      id: '1',
      type: 'action',
      title: 'Recommended Actions',
      description: '5 companies haven\'t been contacted in 30+ days',
      action: {
        label: 'Review companies',
        href: '/app/command-center',
      },
    },
    {
      id: '2',
      type: 'trend',
      title: 'This Week\'s Trends',
      description: 'Import volume from Asia up 18% • Container rates decreased 5%',
      action: {
        label: 'View trends',
        href: '/app/search',
      },
    },
    {
      id: '3',
      type: 'opportunity',
      title: 'Hot Opportunities',
      description: '12 new companies matching your ideal customer profile',
      action: {
        label: 'View opportunities',
        href: '/app/search',
      },
    },
  ];

  const displayInsights = insights.length > 0 ? insights : defaultInsights;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-900">Insights & Recommendations</h2>
        </div>
        <p className="text-sm text-slate-600 mt-1">AI-powered suggestions to grow your pipeline</p>
      </div>

      <div className="p-6 space-y-4">
        {displayInsights.map((insight, index) => {
          const Icon = getInsightIcon(insight.type);
          const colors = getInsightColor(insight.type);

          return (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className={`p-4 rounded-lg border ${colors.border} bg-gradient-to-br ${colors.bg} group hover:shadow-sm transition-shadow`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg bg-white/80 backdrop-blur-sm flex items-center justify-center ${colors.icon} flex-shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-sm ${colors.text} mb-1`}>
                    {insight.title}
                  </div>
                  <div className="text-sm text-slate-700">
                    {insight.description}
                  </div>
                  {insight.action && (
                    <Link
                      to={insight.action.href}
                      className={`inline-flex items-center gap-1 text-sm font-medium ${colors.text} mt-2 hover:underline`}
                    >
                      {insight.action.label}
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
