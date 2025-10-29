import React from "react";

export default function Logos() {
  return (
    <section className="text-center">
      <div className="text-sm uppercase tracking-widest text-gray-500">Trusted by modern logistics teams</div>
      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6 items-center">
        {new Array(6).fill(0).map((_, i) => (
          <div key={i} className="mx-auto h-10 w-28 rounded border border-dashed border-gray-300 text-gray-400 flex items-center justify-center">
            Logo
          </div>
        ))}
      </div>
    </section>
  );
}
