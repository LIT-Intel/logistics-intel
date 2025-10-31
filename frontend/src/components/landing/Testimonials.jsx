import React from "react";

const QUOTES = [
  {
    quote: "We booked our best quarter after arming AEs with shipment intel.",
    name: "VP Sales, NVOCC",
  },
  {
    quote: "The route heatmap is perfect for territory planning.",
    name: "Head of RevOps, Freight Forwarder",
  },
  {
    quote: "Finally, a clean company view that matches how we sell.",
    name: "Director of Marketing",
  },
];

export default function Testimonials() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <h2 className="text-3xl font-bold text-gray-900">What customers say</h2>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {QUOTES.map((quote) => (
          <figure key={quote.quote} className="rounded-lg border border-gray-100 bg-gray-50 p-6">
            <blockquote className="text-gray-800">“{quote.quote}”</blockquote>
            <figcaption className="mt-3 text-sm text-gray-600">{quote.name}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
