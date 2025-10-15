import React, { useEffect, useRef, useState } from 'react';

function useCountUp(target, durationMs = 1200) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let started = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        started = true;
        const start = performance.now();
        function tick(now) {
          const t = Math.min(1, (now - start) / durationMs);
          setValue(Math.floor(target * t));
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, durationMs]);
  return { value, ref };
}

export default function StatsBanner() {
  const s1 = useCountUp(200_000_000);
  const s2 = useCountUp(3_500_000);
  const s3 = useCountUp(10_000);
  return (
    <section className="py-16 bg-slate-50 dark:bg-slate-900/40">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-10">
          <div className="text-sm font-medium text-slate-600">Trusted Signals</div>
          <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Scale with real shipment intelligence</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div ref={s1.ref} className="rounded-2xl bg-white dark:bg-white/10 border border-slate-200/80 p-6 text-center shadow-sm">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{s1.value.toLocaleString()}+</div>
            <div className="text-sm text-slate-600">Shipments</div>
          </div>
          <div ref={s2.ref} className="rounded-2xl bg-white dark:bg-white/10 border border-slate-200/80 p-6 text-center shadow-sm">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{s2.value.toLocaleString()}+</div>
            <div className="text-sm text-slate-600">Contacts</div>
          </div>
          <div ref={s3.ref} className="rounded-2xl bg-white dark:bg-white/10 border border-slate-200/80 p-6 text-center shadow-sm">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{s3.value.toLocaleString()}</div>
            <div className="text-sm text-slate-600">HS Codes</div>
          </div>
        </div>
      </div>
    </section>
  );
}
