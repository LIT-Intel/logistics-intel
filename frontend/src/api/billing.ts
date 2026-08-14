/**
 * Billing domain — Stripe checkout, portal, invoices, subscription mutations,
 * and the canonical billing-status snapshot.
 *
 * Reads pull from `get-billing-status` (JWT-verified, includes the org-owner
 * fallback for invited members). Writes go through Stripe via the
 * `billing-checkout` / `billing-portal` / `cancel-subscription` edge functions.
 *
 * Direct queries against the `subscriptions` table from frontend code are
 * forbidden — see CLAUDE.md.
 */
import { invokeEdge, EdgeFunctionError } from "./_client";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface PaymentMethodSummary {
  hasPaymentMethod: boolean;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  source?: "customer_default" | "subscription_default" | "none";
}

export interface BillingStatus {
  ok: true;
  user_id: string;
  org_id: string | null;
  subscription_owner: "self" | "org_owner" | "none";
  plan: {
    code: string;
    name: string | null;
    included_seats: number | null;
    trial_days: number;
    price_monthly: number | null;
    price_yearly: number | null;
    stripe_price_id_monthly: string | null;
    stripe_price_id_yearly: string | null;
  };
  subscription: {
    status: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    trial_ends_at: string | null;
    seat_quantity: number | null;
  };
  payment_method: PaymentMethodSummary;
  seats: { included: number | null; used: number };
}

export interface CheckoutRequest {
  price_id?: string;
  plan_code?: string;
  billing_interval?: "monthly" | "yearly";
  quantity?: number;
  success_url?: string;
  cancel_url?: string;
}

export interface CheckoutResponse {
  ok: boolean;
  url?: string;
  session_id?: string;
  error?: string;
}

export interface PortalRequest {
  return_url?: string;
}

export interface PortalResponse {
  ok: boolean;
  url?: string;
  error?: string;
}

export interface InvoiceRow {
  id: string;
  number: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  amount_paid: number;
  currency: string;
  created: number;
  period_start: number | null;
  period_end: number | null;
  status: string | null;
}

export interface InvoicesResponse {
  ok: boolean;
  invoices: InvoiceRow[];
  totals: {
    mtdLabel: string;
    ytdLabel: string;
    mtdCents: number;
    ytdCents: number;
  } | null;
}

export interface UpcomingInvoiceRequest {
  price_id?: string;
  plan_code?: string;
  billing_interval?: "monthly" | "yearly";
  quantity?: number;
}

export interface UpcomingInvoiceResponse {
  ok: boolean;
  today_cents: number;
  next_cents: number;
  next_billing_date: string | null;
  prorations: unknown[];
  currency: string;
  error?: string;
}

export interface CancelRequest {
  action?: "cancel" | "reactivate";
  reason?: string;
  feedback?: string;
}

export interface CancelResponse {
  ok: boolean;
  cancel_at_period_end?: boolean;
  current_period_end?: string | null;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Operations
// ──────────────────────────────────────────────────────────────────────────

/** Authoritative billing snapshot (plan + subscription + payment method + seats). */
export async function getBillingStatus(_payload: Record<string, unknown> = {}): Promise<BillingStatus> {
  return invokeEdge<BillingStatus>("get-billing-status", {});
}

/** Create a Stripe Checkout session and redirect URL. */
export async function createStripeCheckout(
  req: CheckoutRequest,
): Promise<CheckoutResponse> {
  return invokeEdge<CheckoutResponse>("billing-checkout", req);
}

/**
 * Result of the in-app (embedded) main-plan checkout. Mirrors the CRM add-on's
 * CrmCheckoutResult so the shared EmbeddedCheckoutModal can consume either.
 */
export type EmbeddedPlanCheckoutResult =
  | { ok: true; client_secret: string; plan_code: string; interval: string }
  | { ok: false; notConfigured: true; message: string };

/**
 * Start an EMBEDDED main-plan checkout via billing-checkout (ui_mode:'embedded').
 * Returns a Stripe Checkout Session client_secret to mount in-app with
 * EmbeddedCheckout. On a Stripe price/mode mismatch the edge fn returns
 * ok:false with code:'billing_not_configured'; we re-map that to a typed
 * { notConfigured:true } result so the modal renders a friendly message instead
 * of a generic error. Any other failure re-throws.
 */
export async function startEmbeddedPlanCheckout(args: {
  plan_code: string;
  interval: "month" | "year";
  return_url?: string;
}): Promise<EmbeddedPlanCheckoutResult> {
  try {
    const res = await invokeEdge<{
      ok: true;
      client_secret: string;
      plan_code: string;
      interval: string;
    }>("billing-checkout", {
      plan_code: args.plan_code,
      interval: args.interval,
      ui_mode: "embedded",
      ...(args.return_url ? { return_url: args.return_url } : {}),
    });
    return {
      ok: true,
      client_secret: res.client_secret,
      plan_code: res.plan_code,
      interval: res.interval,
    };
  } catch (e) {
    if (e instanceof EdgeFunctionError && e.code === "billing_not_configured") {
      return { ok: false, notConfigured: true, message: e.message };
    }
    throw e;
  }
}

/** Create a Stripe Customer Portal session. */
export async function createStripePortalSession(
  req: PortalRequest = {},
): Promise<PortalResponse> {
  return invokeEdge<PortalResponse>("billing-portal", req);
}

/** List Stripe invoices + MTD/YTD totals for the in-app invoice table. */
export async function listStripeInvoices(
  payload: { limit?: number; starting_after?: string } = {},
): Promise<InvoicesResponse> {
  return invokeEdge<InvoicesResponse>("list-invoices", payload);
}

/**
 * Preview the next invoice + today's prorated charge for a plan/seat change.
 * Used to show "today: $X / then $Y/mo from <date>" pre-checkout.
 */
export async function previewUpcomingInvoice(
  req: UpcomingInvoiceRequest,
): Promise<UpcomingInvoiceResponse> {
  return invokeEdge<UpcomingInvoiceResponse>("upcoming-invoice", req);
}

/**
 * Mark the active subscription `cancel_at_period_end = true` (or reverse via
 * `action: "reactivate"`). No refund; access continues to period end.
 */
export async function cancelStripeSubscription(
  req: CancelRequest = {},
): Promise<CancelResponse> {
  return invokeEdge<CancelResponse>("cancel-subscription", req);
}
