import React from 'react';
import { motion } from 'framer-motion';

export default function MetricBand({ data }) {
  const metrics = data?.items || [
    { label: "Companies tracked", value: "2.1M+" },
    { label: "Lanes monitored", value: "38k+" },
    { label: "Avg. reply lift", value: "+34%" }
  ];

  return (
    <section className="py-12 md:py-16 bg-gray-50/70 border-y border-gray-200/60">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {metrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                {metric.value}
              </div>
              <div className="text-gray-600 font-medium">
                {metric.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}