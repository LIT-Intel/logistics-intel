"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/nav/Footer";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in browser console for now; wire to Sentry / Logflare in Phase 3
    console.error("[lit-marketing]", error);
  }, [error]);

  return (
    <>
      <Nav />
      <main>
        <section className="px-5 sm:px-8 pt-20 pb-32">
          <div className="mx-auto max-w-[640px] text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <h1 className="display-xl mt-6">Something went sideways.</h1>
            <p className="lead mx-auto mt-5 max-w-[480px]">
              The page hit an unexpected error. Try refreshing — if this keeps happening, drop a line to
              support@logisticintel.com and we'll dig in.
            </p>
            {error.digest && (
              <div className="font-mono mt-3 text-[12px] text-ink-200">Reference · {error.digest}</div>
            )}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                onClick={reset}
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                <RefreshCcw className="h-4 w-4" />
                Try again
              </button>
              <Link
                href="/"
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white px-6 text-[15px] font-semibold text-ink-900 hover:bg-ink-25"
              >
                Back home
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
