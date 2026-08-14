// Lazy Stripe.js loader shared by the embedded-checkout modals (CRM add-on +
// main-plan upgrade). Stripe.js is pulled from the CDN so we don't add
// @stripe/stripe-js as a build dependency (it isn't in package.json). The
// publishable key comes from VITE_STRIPE_PUBLISHABLE_KEY; when it's unset the
// caller surfaces a "billing not configured" fallback instead of a broken
// checkout.

const STRIPE_JS_URL = "https://js.stripe.com/v3/";

export const STRIPE_PUBLISHABLE_KEY =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_STRIPE_PUBLISHABLE_KEY ?? "";

export type StripeGlobal = {
  (key: string): {
    initEmbeddedCheckout(opts: {
      fetchClientSecret: () => Promise<string>;
    }): Promise<{ mount(el: HTMLElement): void; destroy(): void }>;
  };
};

let stripeJsPromise: Promise<StripeGlobal | null> | null = null;

/**
 * Load Stripe.js from the CDN (idempotent). Resolves the global `Stripe`
 * factory, or null if the script can't be loaded / we're not in a browser.
 */
export function loadStripeJs(): Promise<StripeGlobal | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as unknown as { Stripe?: StripeGlobal };
  if (w.Stripe) return Promise.resolve(w.Stripe);
  if (stripeJsPromise) return stripeJsPromise;
  stripeJsPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${STRIPE_JS_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () =>
        resolve((window as unknown as { Stripe?: StripeGlobal }).Stripe ?? null),
      );
      existing.addEventListener("error", () => resolve(null));
      if ((window as unknown as { Stripe?: StripeGlobal }).Stripe) {
        resolve((window as unknown as { Stripe?: StripeGlobal }).Stripe!);
      }
      return;
    }
    const script = document.createElement("script");
    script.src = STRIPE_JS_URL;
    script.async = true;
    script.onload = () =>
      resolve((window as unknown as { Stripe?: StripeGlobal }).Stripe ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return stripeJsPromise;
}
