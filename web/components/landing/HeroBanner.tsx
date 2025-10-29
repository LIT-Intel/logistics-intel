"use client";
import React from "react";
import InteractivePins from "./InteractivePins";

export default function HeroBanner() {
  return (
    <section className="relative overflow-hidden rounded-xl bg-gradient-to-b from-white to-gray-50 border border-gray-200">
      <div className="absolute inset-0">
        <InteractivePins className="w-full h-full" baseColor="#d1d5db" activeColor="#22d3ee" hoverRadius={140} dotSpacing={26} dotRadius={2} />
        <div className="absolute inset-0 bg-gradient-to-br from-white/70 via-white/40 to-white/10 pointer-events-none" />
      </div>

      <div className="relative px-6 py-16 lg:px-12 lg:py-24">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/80 px-3 py-1 text-sm text-gray-600 shadow-sm backdrop-blur">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            Real-time company intelligence for logistics teams
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            Find and qualify companies in seconds
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Search 12 months of import/export activity to reveal top routes, carriers, and decision-makers.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="/search" className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-white shadow hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2">
              Start Searching
            </a>
            <a href="#demo" className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-gray-900 shadow-sm hover:bg-gray-50">
              Get a Demo
            </a>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 text-left">
            {[
              { label: "Companies indexed", value: "3.2M+" },
              { label: "Shipments tracked", value: "1.1B+" },
              { label: "Carriers covered", value: "3,400+" },
              { label: "Daily updates", value: "100K+" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-gray-200 bg-white/80 p-4 backdrop-blur">
                <div className="text-xs uppercase text-gray-500">{stat.label}</div>
                <div className="mt-1 text-2xl font-semibold text-gray-900">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
