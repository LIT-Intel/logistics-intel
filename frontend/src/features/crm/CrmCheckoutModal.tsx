"use client";

import React, { useCallback } from "react";
import EmbeddedCheckoutModal, {
  type EmbeddedCheckoutResult,
} from "@/components/billing/EmbeddedCheckoutModal";
import { startCrmCheckout } from "@/api/entitlements";

/**
 * Embedded Stripe Checkout for the CRM per-seat add-on. Thin wrapper around the
 * shared EmbeddedCheckoutModal — it only supplies the CRM-specific
 * client-secret provider (crm-checkout edge fn) and the return_url that carries
 * `?crm_checkout=complete` for the parent (PipelineGate) to refetch
 * entitlements after checkout.
 */
export default function CrmCheckoutModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?crm_checkout=complete`
      : undefined;

  const fetchClientSecret = useCallback(async (): Promise<EmbeddedCheckoutResult> => {
    const result = await startCrmCheckout(returnUrl);
    if (result.ok) {
      return { ok: true, client_secret: result.client_secret };
    }
    return {
      ok: false,
      notConfigured: true,
      message: result.message || "CRM billing is not configured for this environment.",
    };
  }, [returnUrl]);

  return (
    <EmbeddedCheckoutModal
      onClose={onClose}
      onComplete={onComplete}
      fetchClientSecret={fetchClientSecret}
      title="Unlock the CRM"
      eyebrow="LIT CRM"
      ariaLabel="Unlock CRM"
    />
  );
}
