import { useEffect, useRef } from "react";

// ─── Cloudflare Turnstile — self-contained, script-loaded, ENV-GATED ─────────
//
// BOT SIGNUP DOOR-BLOCK (primary fix). Renders a Cloudflare Turnstile CAPTCHA
// widget so scripted bots can't POST the signup API directly. Loads the
// Turnstile script on demand (no new npm dependency).
//
// CRITICAL ENV GATE (handled by the *caller*, not this component): read the site
// key from import.meta.env.VITE_TURNSTILE_SITE_KEY. If it is UNSET, the caller
// must NOT render this widget at all — signup then works exactly as it does
// today with no token required. This component is only mounted when a site key
// exists, and it takes the key as a required prop so it can never render blank.

// Cloudflare's Turnstile browser global (loaded via the script tag below).
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "flexible" | "compact";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

// Read the Turnstile site key from Vite env. Exported so callers share ONE
// source of truth for the env gate.
export const TURNSTILE_SITE_KEY: string =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || "";

// True only when the owner has provisioned a site key. When false, callers must
// skip the widget entirely and require no token (signup behaves as today).
export const isTurnstileEnabled = (): boolean => TURNSTILE_SITE_KEY.length > 0;

let scriptPromise: Promise<void> | null = null;

// Load the Turnstile script exactly once, resolving when window.turnstile exists.
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile load failed")));
      if (window.turnstile) resolve();
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile load failed"));
    document.head.appendChild(s);
  });

  return scriptPromise;
}

interface TurnstileWidgetProps {
  siteKey: string;
  // Fired with a fresh token when the challenge is solved.
  onToken: (token: string) => void;
  // Fired when the token expires or the challenge errors — caller should clear
  // any stored token so the submit button re-disables.
  onExpireOrError: () => void;
  className?: string;
}

// Renders one Turnstile challenge. Manages its own script load + widget
// lifecycle, and resets cleanly on unmount. Exposes a `data-turnstile-reset`
// custom event on the host element so a parent (e.g. on signup error) can force
// a fresh challenge without a ref.
export default function TurnstileWidget({
  siteKey,
  onToken,
  onExpireOrError,
  className,
}: TurnstileWidgetProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep latest callbacks without re-rendering the widget.
  const onTokenRef = useRef(onToken);
  const onExpireOrErrorRef = useRef(onExpireOrError);
  onTokenRef.current = onToken;
  onExpireOrErrorRef.current = onExpireOrError;

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host || !siteKey) return;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || !hostRef.current) return;
        widgetIdRef.current = window.turnstile.render(hostRef.current, {
          sitekey: siteKey,
          theme: "auto",
          size: "flexible",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onExpireOrErrorRef.current(),
          "error-callback": () => onExpireOrErrorRef.current(),
        });
      })
      .catch(() => {
        // Script failed to load — surface as an error so the caller can decide.
        if (!cancelled) onExpireOrErrorRef.current();
      });

    // Allow a parent to force a reset (e.g. after a failed signup submit).
    const resetHandler = () => {
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current);
        onExpireOrErrorRef.current();
      }
    };
    host.addEventListener("turnstile-reset", resetHandler);

    return () => {
      cancelled = true;
      host.removeEventListener("turnstile-reset", resetHandler);
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* no-op */
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  return <div ref={hostRef} className={className} />;
}
