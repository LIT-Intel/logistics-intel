import React from 'react';
import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

export default function TestimonialsCarousel({ data }) {
  const testimonials = data?.items || [
    { 
      quote: "We cut prospecting time by 40% in two weeks. The shipment data is incredibly accurate.", 
      name: "Sarah Chen", 
      company: "Global Freight Solutions",
      title: "Regional Sales Lead"
    },
    { 
      quote: "LIT's contact enrichment found decision makers we couldn't locate elsewhere.", 
      name: "Mike Rodriguez", 
      company: "Pacific Logistics",
      title: "Business Development"
    }
  ];

  return (
    <section className="py-16 md:py-24 bg-gray-50/70">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {data?.title || "Trusted by modern forwarding teams"}
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200/60"
            >
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                ))}
              </div>
              
              <Quote className="w-8 h-8 text-blue-600 mb-4" />
              
              <blockquote className="text-gray-800 text-lg mb-6 leading-relaxed">
                "{testimonial.quote}"
              </blockquote>
              
              <div className="border-t border-gray-100 pt-4">
                <p className="font-bold text-gray-900">{testimonial.name}</p>
                <p className="text-gray-600 text-sm">{testimonial.title}</p>
                <p className="text-blue-600 text-sm font-medium">{testimonial.company}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}