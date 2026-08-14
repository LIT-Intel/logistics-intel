"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, AlertTriangle } from "lucide-react";
import {
  loadStripeJs,
  STRIPE_PUBLISHABLE_KEY,
} from "./stripeLoader";

const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

/**
 * Result contract for the client-secret provider. Mirrors the CRM add-on's
 * CrmCheckoutResult so edge fns that return a `billing_not_configured` code map
 * cleanly to a friendly "billing isn't configured yet" state instead of a
 * generic error.
 */
export type EmbeddedCheckoutResult =
  | { ok: true; client_secret: string }
  | { ok: false; notConfigured: true; message: string };

/**
 * Reusable embedded Stripe Checkout modal. Generalized from CrmCheckoutModal so
 * both the CRM add-on and the main-plan upgrade share one portal + Stripe.js
 * mount path. The caller passes a `fetchClientSecret` that hits its own edge fn
 * (crm-checkout / billing-checkout embedded) and returns a client_secret.
 *
 * On checkout completion Stripe performs a full-page redirect to the session's
 * return_url; the parent page reads a URL param on load to refetch entitlements
 * / billing status. `onComplete` is also invoked for callers that later switch
 * to redirect:'if_required' flows.
 */
export default function EmbeddedCheckoutModal({
  onClose,
  onComplete,
  fetchClientSecret,
  title,
  eyebrow = "LIT BILLING",
  ariaLabel,
}: {
  onClose: () => void;
  onComplete: () => void;
  fetchClientSecret: () => Promise<EmbeddedCheckoutResult>;
  title: string;
  eyebrow?: string;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<{ destroy(): void } | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "not_configured"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const init = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      if (!STRIPE_PUBLISHABLE_KEY) {
        setStatus("not_configured");
        setErrorMsg("Stripe publishable key is not set for this environment.");
        return;
      }
      const result = await fetchClientSecret();
      if (!result.ok) {
        setStatus("not_configured");
        setErrorMsg(
          result.message || "Billing is not configured for this environment.",
        );
        return;
      }
      const Stripe = await loadStripeJs();
      if (!Stripe) {
        setStatus("error");
        setErrorMsg("Could not load Stripe. Check your network and try again.");
        return;
      }
      const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
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
  }, [fetchClientSecret]);

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
      aria-label={ariaLabel || title}
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: FONT_HEAD,
                fontSize: 10,
                fontWeight: 700,
                color: "#6366F1",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                fontFamily: FONT_HEAD,
                fontSize: 18,
                fontWeight: 700,
                color: "#0F172A",
              }}
            >
              {title}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#64748b",
              padding: 6,
              borderRadius: 8,
            }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: 16, minHeight: 240 }}>
          {status === "loading" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "48px 0",
                color: "#64748b",
                fontFamily: FONT_BODY,
                fontSize: 14,
              }}
            >
              <Loader2
                style={{
                  width: 16,
                  height: 16,
                  animation: "spin 1s linear infinite",
                }}
              />{" "}
              Preparing secure checkout…
            </div>
          ) : status === "not_configured" || status === "error" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: "40px 16px",
                textAlign: "center",
              }}
            >
              <AlertTriangle
                style={{ width: 28, height: 28, color: "#d97706" }}
              />
              <div
                style={{
                  fontFamily: FONT_HEAD,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#0F172A",
                }}
              >
                {status === "not_configured"
                  ? "Billing isn’t configured yet"
                  : "Something went wrong"}
              </div>
              <div
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  color: "#64748b",
                  maxWidth: 380,
                }}
              >
                {errorMsg}
              </div>
              {status === "error" ? (
                <button
                  onClick={init}
                  style={{
                    marginTop: 4,
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: "#3B82F6",
                    color: "#fff",
                    fontFamily: FONT_HEAD,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
          {/* Stripe mounts its embedded checkout here. Kept in the DOM always so
              the ref exists when mount() is called. */}
          <div
            ref={containerRef}
            style={{ display: status === "ready" ? "block" : "none" }}
          />
        </div>
      </div>
    </div>
  );

  // Stripe embedded checkout with a return_url performs a full-page redirect on
  // success, so the parent's URL-param effect drives the refetch. onComplete is
  // exposed for callers that later switch to onComplete-based
  // (redirect:'if_required') flows.
  void onComplete;

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
