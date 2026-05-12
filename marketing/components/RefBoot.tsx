"use client";

import { useEffect } from "react";

/**
 * Marketing-side affiliate ref capture.
 *
 * Mounted once at the root layout. On every navigation, reads `?ref=` (or
 * `?aff=` / `?partner=`) from the current URL and writes a cookie scoped
 * to `.logisticintel.com` so the value is readable from both the
 * marketing apex AND the app subdomain. The app's signup flow
 * (frontend/src/lib/affiliateRef.ts) reads the same cookie name on
 * authentication and posts a claim — no `?ref=` propagation through
 * CTAs needed.
 *
 * Stays a no-op on localhost / preview hosts (Domain=.logisticintel.com
 * is only set when running on a logisticintel.com host).
 */
const COOKIE_NAME = "lit_affiliate_ref";
const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const REF_PATTERN = /^[A-Za-z0-9_-]{4,32}$/;

function isLogisticIntelHost(host: string): boolean {
  return host === "logisticintel.com" || host.endsWith(".logisticintel.com");
}

function writeRefCookie(refCode: string) {
  if (typeof document === "undefined") return;
  const host = window.location.hostname;
  const secure = window.location.protocol === "https:";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(refCode)}`,
    "Path=/",
    `Max-Age=${TTL_SECONDS}`,
    "SameSite=Lax",
  ];
  // Cross-subdomain scope — the whole point of this component.
  if (isLogisticIntelHost(host)) parts.push("Domain=.logisticintel.com");
  if (secure) parts.push("Secure");
  document.cookie = parts.join("; ");
}

function captureRef() {
  try {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get("ref") || params.get("aff") || params.get("partner") || "").trim();
    if (!raw) return;
    if (!REF_PATTERN.test(raw)) return;
    writeRefCookie(raw);
  } catch {
    // ignore — capture is best-effort
  }
}

export default function RefBoot() {
  useEffect(() => {
    captureRef();
    const onPopState = () => captureRef();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  return null;
}
