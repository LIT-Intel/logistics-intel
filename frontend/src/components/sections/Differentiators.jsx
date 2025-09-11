import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Bot, Users, DollarSign } from 'lucide-react';

export default function Differentiators({ data }) {
  const differentiators = data?.items || [
    {
      title: 'New Shipper Alerts',
      description: 'Be the first to know when companies start shipping new routes or commodities.',
      icon: TrendingUp,
      color: 'from-green-600 to-emerald-600'
    },
    {
      title: 'RFP Predictor',
      description: 'AI identifies companies likely to need freight services based on shipping patterns.',
      icon: Bot,
      color: 'from-blue-600 to-indigo-600'
    },
    {
      title: 'People Signals',
      description: 'Track job changes, company moves, and other events that create sales opportunities.',
      icon: Users,
      color: 'from-purple-600 to-violet-600'
    },
    {
      title: 'Affiliate Program',
      description: 'Earn recurring commissions by referring freight professionals to our platform.',
      icon: DollarSign,
      color: 'from-orange-600 to-red-600'
    }
  ];

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {data?.title || "What makes us different"}
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            {data?.subtitle || "While others focus on data, we focus on helping you turn that data into revenue."}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {differentiators.map((item, index) => {
            const IconComponent = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="text-center"
              >
                <div className={`w-16 h-16 bg-gradient-to-r ${item.color} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}>
                  <IconComponent className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}