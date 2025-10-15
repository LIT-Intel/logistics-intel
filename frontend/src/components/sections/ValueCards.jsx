import React from 'react';
import { motion } from 'framer-motion';
import { Search, FileText, Mail, ArrowRight, Building2, Target, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ValueCards({ data }) {
  const cards = data?.cards || [
    {
      title: "Company Intelligence",
      subtitle: "Shipment intel + similar companies + likely contacts",
      icon: Search,
      features: ["Real shipment data", "Contact enrichment", "Similar company matching", "Trade lane insights"],
      cta: { label: "Start Searching", variant: "primary" }
    },
    {
      title: "RFP & Quote Builder",
      subtitle: "Multimodal builder with branded email & PDF export",
      icon: FileText,
      features: ["Ocean, air, truck rates", "Professional templates", "PDF generation", "Email integration"],
      cta: { label: "Build Quote", variant: "primary" }
    },
    {
      title: "Campaign Automation",
      subtitle: "Gmail-grade composer + sequence automation",
      icon: Mail,
      features: ["Email sequences", "LinkedIn integration", "Performance tracking", "Template library"],
      cta: { label: "Start Campaign", variant: "primary" }
    }
  ];

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {data?.title || "Everything you need to go from search to signed"}
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            {data?.subtitle || "Complete sales platform for freight professionals"}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {cards.map((card, index) => {
            const IconComponent = card.icon;
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200/60 hover:shadow-xl transition-all duration-300 min-h-[340px] flex flex-col"
              >
                <div className="flex-grow">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center mb-6">
                    <IconComponent className="w-6 h-6 text-white" />
                  </div>
                  
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {card.title}
                  </h3>
                  
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    {card.subtitle}
                  </p>

                  <ul className="space-y-2 mb-6">
                    {card.features?.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <Button 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                  data-tracking={`card_${card.title.toLowerCase().replace(/\s+/g, '_')}_cta`}
                >
                  {card.cta?.label}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}