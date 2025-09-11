import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MiddleCTA({ data }) {
  return (
    <section className="py-16 md:py-24 bg-gradient-to-r from-blue-600 to-purple-600 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(to_bottom,white_0%,transparent_50%)]"></div>
      
      <div className="container mx-auto px-4 text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto"
        >
          {data?.badge && (
            <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-white/20 text-white mb-6">
              <Zap className="w-4 h-4 mr-2" />
              {data.badge}
            </div>
          )}
          
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            {data?.title || "Ready to transform your freight sales?"}
          </h2>
          
          <p className="text-lg md:text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
            {data?.subtitle || "Join thousands of freight professionals who use our platform to find new customers and win more business."}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              className="h-14 px-8 bg-white text-blue-600 hover:bg-gray-50 text-lg font-semibold rounded-xl shadow-lg"
              data-tracking="home_middle_cta_primary"
            >
              {data?.cta_primary_label || "Start Free Trial"}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            <Button
              variant="outline"
              className="h-14 px-8 text-lg font-semibold rounded-xl border-2 border-white/30 text-white hover:bg-white/10"
              data-tracking="home_middle_cta_secondary"
            >
              {data?.cta_secondary_label || "Schedule Demo"}
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}