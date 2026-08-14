"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { BarChart3, Search, Users2 } from "lucide-react";
import { useRef } from "react";

const stages = [
  { icon: Search, number: "01", title: "Find active shippers", body: "Surface companies with recent imports, exports, and trade-lane activity." },
  { icon: BarChart3, number: "02", title: "Understand the opportunity", body: "Analyze shipment patterns, lanes, contacts, and recent account changes." },
  { icon: Users2, number: "03", title: "Work the account", body: "Move the account into a freight-native CRM and keep every next step visible." },
];

/**
 * Viewport-gated story motion. Reduced-motion visitors receive the completed
 * path without the repeating runner or stage pulse.
 */
export function SignalJourney() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35, once: false });
  const reduceMotion = useReducedMotion();
  return (
    <section className="px-5 py-14 sm:px-8 sm:py-20" aria-labelledby="signal-journey-heading">
      <div ref={ref} className="signal-journey-surface relative mx-auto max-w-container overflow-hidden rounded-3xl border border-cyan-300/20 px-6 py-12 text-white sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(125,211,252,.09)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,.09)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_82%)]" />
        <div className="relative text-center"><div className="lit-eyebrow-dark">One connected workflow</div><h2 id="signal-journey-heading" className="font-display mt-3 text-[30px] font-semibold tracking-[-0.025em] text-white sm:text-[38px]">From shipment signal to sales action.</h2></div>
        <div className="relative mt-12 grid gap-8 md:grid-cols-3 md:gap-5">
          <div className="absolute left-[16.7%] right-[16.7%] top-10 hidden h-px bg-white/10 md:block" aria-hidden />
          <motion.div className="absolute left-[16.7%] top-10 hidden h-[2px] bg-gradient-to-r from-cyan-300 via-blue-400 to-cyan-300 shadow-[0_0_14px_rgba(34,211,238,.65)] md:block" aria-hidden initial={{ right: "83.3%" }} animate={reduceMotion || !inView ? { right: "16.7%" } : { right: ["83.3%", "83.3%", "50%", "16.7%", "16.7%"] }} transition={reduceMotion ? undefined : { duration: 6.6, times: [0, 0.08, 0.42, 0.76, 1], repeat: Infinity, ease: "easeInOut" }} />
          {stages.map(({ icon: Icon, number, title, body }, index) => (
            <motion.article key={title} className="relative z-10 text-center" animate={reduceMotion || !inView ? undefined : { opacity: [0.62, 1, 0.72, 0.62], y: [0, -3, 0, 0] }} transition={reduceMotion ? undefined : { duration: 6.6, delay: index * 1.65, repeat: Infinity, ease: "easeInOut" }}>
              <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-cyan-200/20 bg-slate-950/35 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_12px_35px_rgba(2,6,23,.35)] backdrop-blur">
                <motion.span className="absolute inset-1 rounded-full border border-cyan-300/20" animate={reduceMotion || !inView ? undefined : { scale: [1, 1.12, 1], opacity: [0.25, 0.75, 0.25] }} transition={reduceMotion ? undefined : { duration: 2.2, delay: index * 1.65, repeat: Infinity }} aria-hidden />
                <Icon className="h-7 w-7 text-cyan-200" aria-hidden /><span className="font-mono absolute -left-2 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400 text-[9px] font-bold text-slate-950 shadow-[0_0_18px_rgba(34,211,238,.55)]">{number}</span>
              </div>
              <h3 className="font-display mt-5 text-[16px] font-semibold text-white">{title}</h3><p className="font-body mx-auto mt-2 max-w-[280px] text-[13px] leading-relaxed text-slate-300">{body}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
