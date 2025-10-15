import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Building2, Users, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';

export default function DashboardHeroCards() {
  const navigate = useNavigate();

  const heroCards = [
    {
      title: "Discover Companies",
      description: "Search by shipment data, trade routes, and business intelligence to find your next prospects.",
      icon: Search,
      color: "from-blue-500 to-blue-600",
      action: "Start Searching",
      path: "Search"
    },
    {
      title: "Manage Prospects", 
      description: "View and organize your saved companies, track engagement, and manage your sales pipeline.",
      icon: Building2,
      color: "from-purple-500 to-purple-600", 
      action: "View Companies",
      path: "Companies"
    },
    {
      title: "Launch Campaigns",
      description: "Create targeted email sequences and LinkedIn outreach campaigns to engage prospects.",
      icon: Users,
      color: "from-green-500 to-green-600",
      action: "Create Campaign", 
      path: "Campaigns"
    }
  ];

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {heroCards.map((card, index) => {
        const IconComponent = card.icon;
        return (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <Card 
              className="relative overflow-hidden rounded-lg bg-white shadow-md border border-gray-200 transition-all duration-300 hover:shadow-lg hover:scale-[1.02] cursor-pointer group h-full"
              onClick={() => navigate(createPageUrl(card.path))}
            >
              <CardHeader className="pb-2">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${card.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
                  <IconComponent className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col justify-between flex-grow">
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  {card.description}
                </p>
                <div className="flex items-center text-blue-600 font-medium text-sm group-hover:text-blue-700 transition-colors">
                  <span>{card.action}</span>
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </CardContent>
              
              {/* Hover gradient overlay */}
              <div className={`absolute inset-0 bg-gradient-to-r ${card.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}