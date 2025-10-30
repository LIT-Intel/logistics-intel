import React from 'react';
import MarketingHeader from '@/components/landing/MarketingHeader';
import MarketingFooter from '@/components/landing/MarketingFooter';
import HeroBanner from '@/components/landing/HeroBanner';
import Logos from '@/components/landing/Logos';
import CTABanners from '@/components/landing/CTABanners';
import Features from '@/components/landing/Features';
import Testimonials from '@/components/landing/Testimonials';

export default function LandingPage() {
  return (
    <div className="bg-white text-gray-900 min-h-screen">
      <MarketingHeader />
      <main className="mx-auto flex max-w-7xl flex-col gap-16 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <HeroBanner />
        <Logos />
        <CTABanners />
        <Features />
        <Testimonials />
      </main>
      <MarketingFooter />
    </div>
  );
}
