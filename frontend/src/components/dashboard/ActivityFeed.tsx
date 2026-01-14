import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Mail, FileText, UserPlus, TrendingUp, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

interface Activity {
  id: string;
  type: 'company_saved' | 'campaign_sent' | 'rfp_generated' | 'contact_added' | 'opportunity';
  title: string;
  description: string;
  timestamp: Date;
  link?: string;
}

interface ActivityFeedProps {
  activities?: Activity[];
  maxItems?: number;
}

const getActivityIcon = (type: Activity['type']) => {
  switch (type) {
    case 'company_saved':
      return Building2;
    case 'campaign_sent':
      return Mail;
    case 'rfp_generated':
      return FileText;
    case 'contact_added':
      return UserPlus;
    case 'opportunity':
      return TrendingUp;
    default:
      return Clock;
  }
};

const getActivityColor = (type: Activity['type']) => {
  switch (type) {
    case 'company_saved':
      return 'from-blue-50 to-blue-100 text-blue-600';
    case 'campaign_sent':
      return 'from-green-50 to-green-100 text-green-600';
    case 'rfp_generated':
      return 'from-purple-50 to-purple-100 text-purple-600';
    case 'contact_added':
      return 'from-orange-50 to-orange-100 text-orange-600';
    case 'opportunity':
      return 'from-emerald-50 to-emerald-100 text-emerald-600';
    default:
      return 'from-slate-50 to-slate-100 text-slate-600';
  }
};

export default function ActivityFeed({ activities = [], maxItems = 10 }: ActivityFeedProps) {
  const defaultActivities: Activity[] = [
    {
      id: '1',
      type: 'company_saved',
      title: 'Company Saved',
      description: 'You saved "ABC Logistics" to Command Center',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      link: '/app/command-center',
    },
    {
      id: '2',
      type: 'campaign_sent',
      title: 'Campaign Update',
      description: 'Q1 Outreach sent 50 emails • 12 opened',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      link: '/app/campaigns',
    },
    {
      id: '3',
      type: 'opportunity',
      title: 'Hot Opportunity',
      description: 'Walmart increased shipments by 40%',
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      link: '/app/search',
    },
  ];

  const displayActivities = activities.length > 0 ? activities : defaultActivities;
  const items = displayActivities.slice(0, maxItems);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Activity Feed</h2>
        <p className="text-sm text-slate-600 mt-1">Recent actions and updates</p>
      </div>

      <div className="divide-y divide-slate-100">
        {items.map((activity, index) => {
          const Icon = getActivityIcon(activity.type);
          const colorClass = getActivityColor(activity.type);

          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              {activity.link ? (
                <Link
                  to={activity.link}
                  className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors group"
                >
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 text-sm">{activity.title}</div>
                    <div className="text-sm text-slate-600 mt-0.5">{activity.description}</div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="flex items-start gap-4 p-4">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 text-sm">{activity.title}</div>
                    <div className="text-sm text-slate-600 mt-0.5">{activity.description}</div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="p-12 text-center">
          <Clock className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No recent activity</p>
          <p className="text-sm text-slate-500 mt-1">Your actions will appear here</p>
        </div>
      )}
    </div>
  );
}
