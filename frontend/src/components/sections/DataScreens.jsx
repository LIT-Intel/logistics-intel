import React from 'react';
import { motion } from 'framer-motion';
import { Building2, FileText, BarChart3 } from 'lucide-react';

export default function DataScreens({ data }) {
  const screens = data?.items || [
    {
      type: 'CompanyCard',
      title: 'Detailed Company Profiles',
      description: 'Get comprehensive insights into any company\'s shipping activity, trade patterns, and business intelligence.',
      image_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=400&fit=crop',
      icon: Building2,
      stats: ['12M+ Companies', '500M+ Shipments', '200+ Countries']
    },
    {
      type: 'RFP',
      title: 'Smart RFP Builder',
      description: 'Create professional quotes and RFPs in minutes with our intelligent pricing engine and branded templates.',
      image_url: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&h=400&fit=crop',
      icon: FileText,
      stats: ['Ocean & Air Rates', 'Auto-calculations', 'PDF Export']
    },
    {
      type: 'Dashboard',
      title: 'Performance Analytics',
      description: 'Track your outreach campaigns, monitor market trends, and measure your sales performance in real-time.',
      image_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop',
      icon: BarChart3,
      stats: ['Campaign Tracking', 'Market Intelligence', 'Revenue Analytics']
    }
  ];

  return (
    <section className="py-16 md:py-24 bg-gray-50/70">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {data?.title || "Everything you need in one platform"}
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            {data?.subtitle || "From prospecting to closing, our integrated tools help you manage the entire freight sales process."}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {screens.map((screen, index) => {
            const IconComponent = screen.icon;
            return (
              <motion.div
                key={screen.type}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className="bg-white rounded-2xl p-6 md:p-8 shadow-lg border border-gray-200/60 hover:shadow-xl transition-all duration-300"
              >
                <div className="mb-6">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center mb-4">
                    <IconComponent className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{screen.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{screen.description}</p>
                </div>

                <div className="mb-6">
                  <img
                    src={screen.image_url}
                    alt={screen.title}
                    className="w-full h-48 object-cover rounded-xl shadow-md"
                  />
                </div>

                <div className="space-y-2">
                  {screen.stats?.map((stat, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                      <span>{stat}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}