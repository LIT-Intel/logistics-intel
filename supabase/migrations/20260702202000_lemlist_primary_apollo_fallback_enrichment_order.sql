-- LIT enrichment provider strategy: Lemlist first, Apollo fallback.
-- Lusha is intentionally inactive while LIT evaluates the best enrichment provider.

alter table public.lit_org_enrichment_settings
  alter column provider_order set default array['lemlist','apollo']::text[];

update public.lit_org_enrichment_settings
set provider_order = array['lemlist','apollo']::text[],
    updated_at = now();

comment on column public.lit_org_enrichment_settings.provider_order is
  'Ordered enrichment cascade. Current LIT default: lemlist first, apollo fallback. Lusha is intentionally inactive while LIT evaluates the best enrichment provider.';
