import React from "react";
import { Link } from "react-router-dom";
import PlusField from "@/components/landing/PlusField";
import FluidHoverSkin from "@/components/ui/FluidHoverSkin";

export default function HeroBanner() {
  const stats = [
    { label: "Companies indexed", value: "3.2M+" },
    { label: "Shipments tracked", value: "1.1B+" },
    { label: "Carriers covered", value: "3,400+" },
    { label: "Daily updates", value: "100K+" },
  ];

  return (
    <FluidHoverSkin
      as="section"
      className="relative m-[5px] rounded-2xl border border-gray-200 bg-gradient-to-b from-white via-white/70 to-gray-50 shadow-[0_40px_70px_rgba(15,23,42,0.08)]"
      colors={["#3C4EF5", "#AB34F5", "#22D3EE"]}
      intensity={0.9}
    >
      <div className="absolute inset-0 opacity-90">
        <PlusField className="h-full w-full" baseColor="#d9ddff" activeColor="#4b57ff" hoverRadius={160} gap={28} strokeWidth={1.4} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/90 via-white/60 to-white/15" />
      </div>

      <div className="relative px-6 py-16 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-sm text-slate-600 shadow-sm backdrop-blur">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            Real-time company intelligence for logistics teams
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Find and qualify companies in seconds
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Search 12 months of import/export activity to reveal top routes, carriers, and decision-makers.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/search"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#3C4EF5] via-[#4F46E5] to-[#22D3EE] px-6 py-3 text-white shadow-lg shadow-[#3C4EF5]/25 transition hover:shadow-xl hover:shadow-[#22D3EE]/30 focus:outline-none focus:ring-2 focus:ring-[#22D3EE] focus:ring-offset-2"
            >
              Start Searching
            </Link>
            <a
              href="#demo"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white/90 px-6 py-3 text-slate-900 shadow-sm transition hover:bg-slate-50"
            >
              Get a Demo
            </a>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 text-left sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-white/60 bg-white/80 p-4 shadow-inner backdrop-blur">
                <div className="text-xs uppercase tracking-wide text-slate-500">{stat.label}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </FluidHoverSkin>
  );
}
