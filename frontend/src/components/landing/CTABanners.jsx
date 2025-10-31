import React from "react";
import { Link } from "react-router-dom";

export default function CTABanners() {
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <Link
        to="/command-center"
        className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-8 shadow-sm transition hover:shadow"
      >
        <div className="absolute right-0 top-0 -mr-8 -mt-8 h-40 w-40 rounded-full bg-cyan-100 opacity-60 blur-2xl transition group-hover:opacity-90" />
        <h3 className="text-2xl font-semibold text-gray-900">Command Center</h3>
        <p className="mt-2 text-gray-600">Build and segment target lists with filters for routes, carriers, and more.</p>
        <div className="mt-6 inline-flex items-center gap-2 text-cyan-600">
          Explore
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </Link>

      <Link
        to="/rfp"
        className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-8 shadow-sm transition hover:shadow"
      >
        <div className="absolute right-0 top-0 -mr-8 -mt-8 h-40 w-40 rounded-full bg-amber-100 opacity-60 blur-2xl transition group-hover:opacity-90" />
        <h3 className="text-2xl font-semibold text-gray-900">RFPs and Pricing</h3>
        <p className="mt-2 text-gray-600">Instantly estimate volumes, lanes and benchmark TEUs for proposals.</p>
        <div className="mt-6 inline-flex items-center gap-2 text-amber-600">
          Try it now
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </Link>
    </section>
  );
}
