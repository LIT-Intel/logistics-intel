-- Existing org rows may still have Apollo-only provider order from the earlier
-- enrichment settings rollout. Keep live orgs aligned with the new provider
-- strategy: Lemlist primary, Apollo fallback, Tier-3 disabled unless explicitly
-- enabled later by an admin.

update public.lit_org_enrichment_settings
set provider_order = array['lemlist','apollo']::text[],
    enable_tier3 = false,
    updated_at = now()
where provider_order is distinct from array['lemlist','apollo']::text[];
