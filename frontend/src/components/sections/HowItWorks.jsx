import React from 'react';
import { motion } from 'framer-motion';
import { Search, Users, FileText, Zap } from 'lucide-react';

export default function HowItWorks({ data }) {
  const steps = data?.items || [
    { step: 1, h3: "Search real shipments", p: "Company, HS, or route with mode/date filters.", icon: Search },
    { step: 2, h3: "Know who to contact", p: "Likely contacts by department + enrichment.", icon: Users },
    { step: 3, h3: "Send a better proposal", p: "Multimodal RFP quote inserted into email.", icon: FileText },
    { step: 4, h3: "Automate follow-ups", p: "Sequences with tracking across email + LinkedIn.", icon: Zap }
  ];

  return (
    <section className="py-16 md:py-24 bg-gray-50/70">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {data?.title || "How LIT works"}
          </h2>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => {
              const IconComponent = step.icon;
              return (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="relative mb-6">
                    <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                      <IconComponent className="w-8 h-8 text-white" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md border-2 border-gray-100">
                      <span className="text-sm font-bold text-gray-900">{step.step}</span>
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-bold text-gray-900 mb-3">
                    {step.h3}
                  </h3>
                  
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {step.p}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}