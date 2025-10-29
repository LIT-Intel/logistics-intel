import React from "react";

const FEATURES = [
  {
    title: "Company Graph",
    desc: "Normalize names across shippers, consignees and parties to reveal the real company.",
    color: "bg-rose-100 text-rose-700",
  },
  {
    title: "Route Intelligence",
    desc: "Top O/D country pairs and carriers over 12 months to prioritize outreach.",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    title: "Advanced Filters",
    desc: "Mode, HS codes, origins, destinations and carriers to refine results.",
    color: "bg-cyan-100 text-cyan-700",
  },
  {
    title: "Exports API",
    desc: "Push qualified accounts directly to your CRM and sequences.",
    color: "bg-amber-100 text-amber-700",
  },
];

export default function Features() {
  return (
    <section>
      <h2 className="text-3xl font-bold text-gray-900">Why teams choose us</h2>
      <p className="mt-2 text-gray-600 max-w-2xl">Purpose-built for logistics sales and marketing with the freshest shipment signals.</p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className={`inline-flex items-center rounded-md px-2 py-1 text-sm ${f.color}`}>{f.title}</div>
            <p className="mt-3 text-gray-600">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
