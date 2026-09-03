import type { ReactNode } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, FileText, Sparkles } from "lucide-react";
import { springs } from "@/lib/motion";

/**
 * Temporary hold gate for the RFP module while it's under active development.
 * Renders a "Coming Soon" screen instead of the workspace so end users don't
 * try to use the half-built tool. The owner can bypass with `?preview=1` to
 * keep building (e.g. /app/rfp?preview=1).
 */
export function RfpGate({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  if (params.get("preview") === "1") return <>{children}</>;
  return <RfpComingSoon />;
}

export default function RfpComingSoon() {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-[calc(100vh-64px)] place-items-center bg-gradient-to-br from-slate-50 to-slate-100 px-6">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springs.default}
        className="w-full max-w-lg rounded-2xl border border-white/60 bg-white/70 p-8 text-center shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-10"
      >
        <motion.span
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...springs.momentum, delay: 0.08 }}
          className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25"
        >
          <FileText className="h-7 w-7" />
        </motion.span>

        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">
          <Clock className="h-3.5 w-3.5" /> Coming Soon
        </div>

        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-slate-900">
          RFP Studio is getting an upgrade
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-slate-600">
          We're rebuilding the RFP workspace into a full freight rate-sheet builder — surcharge
          breakdowns, all-in pricing, and a landscape proposal export. It's under active development
          and temporarily unavailable.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate("/app/search")}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-[14px] font-semibold text-white shadow-sm transition active:scale-[0.97] hover:bg-blue-700 motion-reduce:active:scale-100"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Search
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/dashboard")}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-[14px] font-semibold text-slate-700 transition active:scale-[0.97] hover:bg-slate-50 motion-reduce:active:scale-100"
          >
            <Sparkles className="h-4 w-4 text-blue-600" /> Go to Dashboard
          </button>
        </div>
      </motion.div>
    </div>
  );
}
