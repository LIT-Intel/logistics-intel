import React from 'react';
import { motion } from 'framer-motion';

export default function ScreenshotGallery({ data }) {
  const gallery = data?.gallery || [
    { caption: "Company profile with smart enrichment", src: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop" },
    { caption: "RFP builder with live email preview", src: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=600&fit=crop" },
    { caption: "Campaign analytics", src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop" }
  ];

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {data?.title || "From intel to action in minutes"}
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {gallery.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              className="group"
            >
              <div className="relative overflow-hidden rounded-2xl shadow-lg">
                <img
                  src={item.src}
                  alt={item.caption}
                  className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="text-white font-medium text-sm">
                    {item.caption}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}