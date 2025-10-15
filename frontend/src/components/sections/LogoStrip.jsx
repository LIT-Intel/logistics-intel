import React from 'react';

export default function LogoStrip({ data }) {
  const logos = data?.logos || data?.items || [];
  
  return (
    <section className="bg-white py-12 md:py-16 border-b border-gray-100">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm text-gray-500 font-semibold uppercase tracking-wider mb-8">
          {data?.title || "Trusted by freight forwarders and 3PLs worldwide"}
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-10 md:gap-x-16 gap-y-8 opacity-70">
          {logos.map((logo, index) => (
            <img 
              key={index} 
              src={logo.image_url || logo.logo_url} 
              alt={logo.alt_text || logo.name || `Partner ${index + 1}`} 
              className="h-6 md:h-8 object-contain hover:opacity-100 transition-opacity grayscale hover:grayscale-0" 
            />
          ))}
        </div>
      </div>
    </section>
  );
}