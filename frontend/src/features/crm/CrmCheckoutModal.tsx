"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { startCrmCheckout } from "@/api/entitlements";

const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

// Stripe.js is loaded lazily from the CDN so we don't add @stripe/stripe-js as a
// heavy build dependency (it isn't in package.json). The publishable key comes
// from VITE_STRIPE_PUBLISHABLE_KEY; when it's unset we surface a clear
// "billing not configured" message instead of a broken checkout.
const STRIPE_JS_URL = "https://js.stripe.com/v3/";
const PUBLISHABLE_KEY =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_STRIPE_PUBLISHABLE_KEY ?? "";

type StripeGlobal = {
  (key: string): {
    initEmbeddedCheckout(opts: {
      fetchClientSecret: () => Promise<string>;
    }): Promise<{ mount(el: HTMLElement): void; destroy(): void }>;
  };
};

let stripeJsPromise: Promise<StripeGlobal | null> | null = null;

function loadStripeJs(): Promise<StripeGlobal | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as unknown as { Stripe?: StripeGlobal };
  if (w.Stripe) return Promise.resolve(w.Stripe);
  if (stripeJsPromise) return stripeJsPromise;
  stripeJsPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${STRIPE_JS_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve((window as unknown as { Stripe?: StripeGlobal }).Stripe ?? null));
      existing.addEventListener("error", () => resolve(null));
      if ((window as unknown as { Stripe?: StripeGlobal }).Stripe) resolve((window as unknown as { Stripe?: StripeGlobal }).Stripe!);
      return;
    }
    const script = document.createElement("script");
    script.src = STRIPE_JS_URL;
    script.async = true;
    script.onload = () => resolve((window as unknown as { Stripe?: StripeGlobal }).Stripe ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return stripeJsPromise;
}

/**
 * Embedded Stripe Checkout for the CRM per-seat add-on. Renders in a centered
 * portal modal above the app. On checkout completion Stripe redirects to the
 * return_url; we also poll-free rely on the parent refetching entitlements when
 * the modal is closed after a completed session. The completion return_url
 * carries `?crm_checkout=complete`, which the parent uses to refetch.
 */
export default function CrmCheckoutModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<{ destroy(): void } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "not_configured">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?crm_checkout=complete`
      : undefined;

  const init = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      if (!PUBLISHABLE_KEY) {
        setStatus("not_configured");
        setErrorMsg("Stripe publishable key is not set for this environment.");
        return;
      }
      const result = await startCrmCheckout(returnUrl);
      if (!result.ok) {
        setStatus("not_configured");
        setErrorMsg(result.message || "CRM billing is not configured for this environment.");
        return;
      }
      const Stripe = await loadStripeJs();
      if (!Stripe) {
        setStatus("error");
        setErrorMsg("Could not load Stripe. Check your network and try again.");
        return;
      }
      const stripe = Stripe(PUBLISHABLE_KEY);
      const checkout = await stripe.initEmbeddedCheckout({
        fetchClientSecret: async () => result.client_secret,
      });
      checkoutRef.current = checkout;
      if (containerRef.current) {
        checkout.mount(containerRef.current);
        setStatus("ready");
      }
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message || "Could not start checkout. Please try again.");
    }
  }, [returnUrl]);

  useEffect(() => {
    init();
    return () => {
      try {
        checkoutRef.current?.destroy();
      } catch {
        /* ignore */
      }
      checkoutRef.current = null;
    };
  }, [init]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unlock CRM"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#FFFFFF",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(15,23,42,0.28)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #E5E7EB" }}>
          <div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700, color: "#6366F1", letterSpacing: "0.22em", textTransform: "uppercase" }}>LIT CRM</div>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, color: "#0F172A" }}>Unlock the CRM</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748b", padding: 6, borderRadius: 8 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: 16, minHeight: 240 }}>
          {status === "loading" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "48px 0", color: "#64748b", fontFamily: FONT_BODY, fontSize: 14 }}>
              <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Preparing secure checkout…
            </div>
          ) : status === "not_configured" || status === "error" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 16px", textAlign: "center" }}>
              <AlertTriangle style={{ width: 28, height: 28, color: "#d97706" }} />
              <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
                {status === "not_configured" ? "Billing isn’t configured yet" : "Something went wrong"}
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#64748b", maxWidth: 380 }}>{errorMsg}</div>
              {status === "error" ? (
                <button onClick={init} style={{ marginTop: 4, padding: "8px 16px", borderRadius: 10, border: "none", background: "#3B82F6", color: "#fff", fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
          {/* Stripe mounts its embedded checkout here. Kept in the DOM always so
              the ref exists when mount() is called. */}
          <div ref={containerRef} style={{ display: status === "ready" ? "block" : "none" }} />
        </div>
      </div>
    </div>
  );

  // Complete handler: Stripe embedded checkout with a return_url performs a
  // full-page redirect on success, so the parent's URL-param effect drives the
  // refetch. onComplete is exposed for callers that later switch to
  // onComplete-based (redirect:'if_required') flows.
  void onComplete;

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
