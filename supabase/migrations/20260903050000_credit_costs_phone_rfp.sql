-- Repricing: phone reveal is the priciest waterfall data; full contact
-- enrichment is its superset; RFP/proposal generation is a premium upsell.
update public.lit_credit_feature_costs set credits=12 where feature_key='phone_reveal';
update public.lit_credit_feature_costs set credits=15 where feature_key='contact_enrichment';
insert into public.lit_credit_feature_costs (feature_key, credits, label, category, active)
values ('rfp_generate', 30, 'RFP / proposal generation', 'exports', true)
on conflict (feature_key) do update
  set credits=excluded.credits, label=excluded.label, category=excluded.category, active=true;
