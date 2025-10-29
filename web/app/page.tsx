"use client";
import React from "react";
import HeroBanner from "@/components/landing/HeroBanner";
import CTABanners from "@/components/landing/CTABanners";
import Features from "@/components/landing/Features";
import Logos from "@/components/landing/Logos";
import Testimonials from "@/components/landing/Testimonials";

export default function Page() {
  return (
    <div className="flex flex-col gap-16 lg:gap-24">
      <HeroBanner />
      <Logos />
      <CTABanners />
      <Features />
      <Testimonials />
    </div>
  );
}
