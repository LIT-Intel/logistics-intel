-- Credits v2 — make purchases work + finish the annual pricing flip.
--
-- (1) GRANT FIX (the bug behind the empty Purchase modal): lit_credit_packages
--     had an RLS SELECT policy for `authenticated` but no base-table GRANT, so
--     every authenticated read failed with "permission denied" and the modal
--     rendered zero packs. RLS filters AFTER the grant — both are required.
grant select on public.lit_credit_packages to authenticated;

-- (2) v2 PRICING repoint (monthly was applied earlier; annual added here after
--     minting the annual Stripe prices via admin-stripe-setup). Safe: zero active
--     subs are on the legacy paid prices. Checkout + billing-webhook resolve plan
--     from these columns, so both now use v2 for new customers. Existing (none)
--     are unaffected. Idempotent — re-running just re-sets the same values.
update public.plans set
  stripe_price_id_monthly = coalesce(stripe_price_id_monthly_v2, stripe_price_id_monthly),
  price_monthly           = coalesce(price_monthly_v2, price_monthly),
  monthly_credit_quota    = coalesce(monthly_credit_quota_v2, monthly_credit_quota),
  included_seats          = coalesce(included_seats_v2, included_seats)
where code in ('starter','growth','scale','enterprise') and stripe_price_id_monthly_v2 is not null;

update public.plans set stripe_price_id_yearly='price_1UBQQa30nhNIomhF5UdKVHUv', price_yearly=1350  where code='starter';
update public.plans set stripe_price_id_yearly='price_1UBQQa30nhNIomhFjPwzKm5K', price_yearly=4491  where code='growth';
update public.plans set stripe_price_id_yearly='price_1UBQQc30nhNIomhF7dNRBhkR', price_yearly=11250 where code='scale';
