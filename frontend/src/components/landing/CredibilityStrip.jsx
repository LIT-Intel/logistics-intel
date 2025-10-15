import React from 'react';

export default function CredibilityStrip({ data }) {
  // Fallback to empty array if logos are not provided
  const logos = data?.logos || [];

  return (
    <section className="bg-white py-12">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm text-gray-500 font-semibold uppercase tracking-wider mb-8">
          {data?.heading}
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-10 md:gap-x-16 gap-y-8">
          {logos.map((logo, index) => (
            <img 
              key={index} 
              src={logo.image_url} 
              alt={logo.alt_text} 
              className="h-7 md:h-9 object-contain opacity-70 hover:opacity-100 transition-opacity" 
              style={{ filter: 'grayscale(100%)', mixBlendMode: 'multiply' }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}