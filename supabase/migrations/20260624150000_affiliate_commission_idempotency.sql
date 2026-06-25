-- Affiliate commission idempotency guard.
--
-- The affiliate "money path" credits one commission per paid Stripe invoice
-- (see supabase/functions/_shared/affiliate_commission.ts). The edge-fn code
-- already checks for an existing row keyed on invoice_id before inserting, but
-- a webhook retry that races the first delivery (two concurrent invocations of
-- the same invoice.payment_succeeded event) could slip past the in-code check
-- and double-insert.
--
-- This UNIQUE partial index is the belt-and-suspenders DB-level guard: the
-- second concurrent insert fails with a 23505 unique_violation, which the
-- shared module catches and reports as { credited:false, reason:'already_credited' }.
-- Partial (WHERE invoice_id IS NOT NULL) so manual/adjustment commission rows
-- that carry no invoice_id are never blocked.
--
-- There is already a NON-unique btree index idx_affiliate_commissions_invoice
-- on the same column for lookup speed; this adds a distinct UNIQUE index and
-- does not conflict with it.

create unique index if not exists affiliate_commissions_invoice_id_unique
  on public.affiliate_commissions (invoice_id)
  where invoice_id is not null;
