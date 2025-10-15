import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

export default function FeaturesFlow({ data }) {
    const [activeTab, setActiveTab] = useState(data.features[0]?.title);

    const activeFeature = data.features.find(f => f.title === activeTab);

    return (
        <section className="py-16 md:py-24 bg-gray-50/70">
            <div className="container mx-auto px-4">
                <div className="text-center mb-12 md:mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900">{data.heading}</h2>
                    <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto">{data.subheading}</p>
                </div>

                <div className="grid lg:grid-cols-12 gap-8 md:gap-12 items-center">
                    <div className="lg:col-span-4">
                        <div className="flex flex-col gap-2">
                            {data.features.map(feature => (
                                <button
                                    key={feature.title}
                                    onClick={() => setActiveTab(feature.title)}
                                    className={`p-5 rounded-xl text-left transition-all duration-300 transform hover:-translate-y-1 ${
                                        activeTab === feature.title
                                            ? 'bg-white shadow-lg border-l-4 border-blue-500'
                                            : 'bg-white/50 hover:bg-white hover:shadow-md'
                                    }`}
                                >
                                    <h3 className="font-bold text-gray-900 text-lg">{feature.title}</h3>
                                    <p className="text-gray-600 mt-1">{feature.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="lg:col-span-8 h-[350px] md:h-[500px] relative">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -20, scale: 0.98 }}
                                transition={{ duration: 0.35, ease: 'easeInOut' }}
                                className="absolute inset-0"
                            >
                                <img
                                    src={activeFeature?.image_url}
                                    alt={activeFeature?.title}
                                    className="w-full h-full object-cover object-top rounded-2xl shadow-2xl border border-gray-200/80"
                                />
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </section>
    );
}