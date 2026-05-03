"use client";

import { useState } from "react";
import { Play, X, Sparkles } from "lucide-react";

/**
 * Loom-style tour placeholder. Renders a polished thumbnail with a
 * play button overlay. When clicked, opens a modal that's pre-wired
 * to receive a Loom embed URL (or YouTube / Wistia / Mux URL).
 *
 * To go live: pass `loomUrl` to the component (e.g. when a 90s tour
 * gets recorded). With no URL, the modal shows clear instructions
 * for the marketing owner to swap in.
 */
export function LoomTourPlaceholder({
  loomUrl,
  className = "",
}: {
  loomUrl?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`px-8 py-16 ${className}`}>
      <div className="mx-auto max-w-container">
        <div className="mx-auto max-w-[700px] text-center">
          <div className="eyebrow">Watch a tour</div>
          <h2 className="display-lg mt-3">
            See LIT in <span className="grad-text">90 seconds.</span>
          </h2>
          <p className="lead mx-auto mt-4 max-w-[560px]">
            From a natural-language Pulse question to a launched outbound campaign — without switching
            tabs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative mx-auto mt-10 block aspect-video w-full max-w-[920px] overflow-hidden rounded-3xl border border-white/10 transition-transform hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
            boxShadow: "0 30px 80px -20px rgba(15,23,42,0.5)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-16 h-80 w-80 rounded-full opacity-50"
            style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80 rounded-full opacity-30"
            style={{ background: "radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%)" }}
          />

          {/* Mock browser frame inside */}
          <div className="absolute inset-6 rounded-2xl border border-dark-3 bg-dark-0">
            <div className="flex items-center gap-1.5 border-b border-dark-3 bg-dark-1 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-rose-500/70" />
              <span className="h-2 w-2 rounded-full bg-amber-500/70" />
              <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
              <span className="font-mono ml-3 truncate rounded border border-dark-3 bg-dark-2 px-2 py-0.5 text-[10px] text-ink-200">
                app.logisticintel.com / pulse
              </span>
            </div>
            <div className="grid h-full grid-cols-3 gap-3 p-4">
              <div className="col-span-2 space-y-2">
                <div className="h-6 rounded-md border border-dark-3 bg-dark-1" />
                <div className="space-y-1.5">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-3 rounded-md border border-dark-3 bg-dark-1" />
                  ))}
                </div>
              </div>
              <div className="col-span-1 space-y-2">
                <div className="h-12 rounded-md border border-dark-3 bg-dark-1" />
                <div className="h-12 rounded-md border border-dark-3 bg-dark-1" />
                <div className="h-12 rounded-md border border-dark-3 bg-dark-1" />
              </div>
            </div>
          </div>

          {/* Play button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="flex h-20 w-20 items-center justify-center rounded-full transition-transform group-hover:scale-110"
              style={{
                background: "rgba(0,240,255,0.12)",
                boxShadow: "0 0 0 1px rgba(0,240,255,0.4), 0 0 60px rgba(0,240,255,0.35)",
                backdropFilter: "blur(8px)",
              }}
            >
              <Play
                className="h-8 w-8 translate-x-0.5"
                style={{ color: "#00F0FF", fill: "#00F0FF" }}
              />
            </span>
          </div>

          {/* Caption */}
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between text-white">
            <div>
              <div
                className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "#00F0FF" }}
              >
                <Sparkles className="mr-1 inline h-3 w-3" />
                Product tour · 90 seconds
              </div>
              <div className="font-display mt-1 text-left text-[18px] font-semibold">
                Pulse → Coach → Campaign, end-to-end
              </div>
            </div>
            <span className="font-mono hidden text-[10px] text-ink-200 sm:block">
              No email gate · No sign-up
            </span>
          </div>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-0/80 p-4 backdrop-blur"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-[1080px] overflow-hidden rounded-2xl border border-white/10 bg-dark-0 shadow-[0_30px_120px_-20px_rgba(0,240,255,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            {loomUrl ? (
              <div className="aspect-video">
                <iframe
                  src={loomUrl}
                  className="h-full w-full"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center bg-dark-0 px-8 text-center text-white">
                <div>
                  <Sparkles className="mx-auto h-8 w-8" style={{ color: "#00F0FF" }} />
                  <div className="font-display mt-4 text-[20px] font-semibold">
                    Tour video not yet recorded
                  </div>
                  <p className="font-body mx-auto mt-2 max-w-[480px] text-[13px] leading-relaxed text-ink-150">
                    When the 90-second walkthrough is recorded, pass its URL to{" "}
                    <code className="font-mono rounded bg-white/10 px-1.5 py-0.5 text-[12px]">
                      &lt;LoomTourPlaceholder loomUrl=&quot;…&quot; /&gt;
                    </code>{" "}
                    in <code className="font-mono">app/page.tsx</code>. Loom, YouTube, Wistia, and Mux
                    embed URLs all work.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
