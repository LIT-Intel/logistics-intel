-- Demo seed companies + saved-company dedupe (CEO items, 2026-08-13)
--
-- 1. lit_saved_companies.source — marks how a row got saved. 'user' (default,
--    every existing + normal save) vs 'demo_seed' (auto-provisioned on signup).
-- 2. One-time dedupe: the same user had the same company saved under multiple
--    lit_companies key variants (`tesla` vs `company/tesla`, legacy ImportYeti
--    hex ids, raw UUID keys). Keep the OLDEST row per (user, normalized name).
-- 3. Uniqueness guard: canonical-key unique index so `company/x` and `x`
--    can never both be saved by one user again.
-- 4. check_usage_limit: demo_seed rows do NOT consume the saved_company cap
--    (free-trial cap = 10 — without this, seeded users could save nothing).
-- 5. Curated seed list stored in lit_internal_meta (editable without deploys).
-- 6. handle_new_user_org_bootstrap seeds the list for NEW users only.

-- ── 1. source marker ────────────────────────────────────────────────────────
ALTER TABLE public.lit_saved_companies
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';

COMMENT ON COLUMN public.lit_saved_companies.source IS
  'How the row was created: user (normal save) | demo_seed (auto-provisioned on signup; exempt from saved_company cap)';

-- ── 2. one-time dedupe (keep oldest per user + normalized company name) ─────
WITH ranked AS (
  SELECT sc.id,
         row_number() OVER (
           PARTITION BY sc.user_id, lower(coalesce(c.normalized_name, c.name))
           ORDER BY sc.created_at ASC, sc.id ASC
         ) AS rn
  FROM public.lit_saved_companies sc
  JOIN public.lit_companies c ON c.id = sc.company_id
)
DELETE FROM public.lit_saved_companies
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ── 2b. second dedupe pass: same canonical key, different display names ─────
-- Catches pairs the name-grouping misses (e.g. "Aglc" vs "Alberta Gaming &
-- Liquor Commission" both saved under alberta-gaming-liquor-commission).
WITH ranked_key AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, lower(regexp_replace(source_company_key, '^company/', ''))
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.lit_saved_companies
  WHERE source_company_key IS NOT NULL
)
DELETE FROM public.lit_saved_companies
WHERE id IN (SELECT id FROM ranked_key WHERE rn > 1);

-- ── 3. canonical-key uniqueness guard ───────────────────────────────────────
-- `company/<slug>` is a legacy ImportYeti URL-path variant of `<slug>`.
-- (Hex-id vs slug variants of the same company can still slip past this —
-- those are prevented at write time in the save-company edge fn.)
CREATE UNIQUE INDEX IF NOT EXISTS lit_saved_companies_user_canonical_key_uniq
  ON public.lit_saved_companies (user_id, lower(regexp_replace(source_company_key, '^company/', '')))
  WHERE source_company_key IS NOT NULL;

-- ── 4. cap exemption for demo seeds ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_usage_limit(p_org_id uuid, p_user_id uuid, p_feature_key text, p_quantity integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan_code text; v_limit integer; v_kind text; v_used integer := 0;
  v_period_start timestamptz; v_period_end timestamptz; v_is_admin boolean := false;
begin
  v_plan_code := public.resolve_plan_code(p_org_id, p_user_id);
  select limit_value, kind into v_limit, v_kind from public.resolve_feature_limit(v_plan_code, p_feature_key);

  if v_kind = 'unknown' then
    return jsonb_build_object('ok',false,'code','UNKNOWN_FEATURE','feature',p_feature_key,'plan',v_plan_code,
      'message',format('Unknown feature key: %s',p_feature_key));
  end if;

  -- FREE-TRIAL UNIFIED SEARCH BUDGET: Pulse Explorer + Company Search share ONE
  -- 5-search budget over the WHOLE trial (lifetime, not monthly). Paid plans fall
  -- through to their standard separate per-feature monthly limits below.
  if v_plan_code = 'free_trial' and p_feature_key in ('pulse_search','company_search') then
    select trial_search_limit into v_limit from plans where code = 'free_trial';
    v_kind := 'total';
    select coalesce(sum(quantity),0)::integer into v_used
      from lit_usage_ledger
     where feature_key in ('pulse_search','company_search')
       and ((p_org_id is not null and org_id = p_org_id) or (p_user_id is not null and user_id = p_user_id));
  elsif v_limit is not null and v_kind = 'monthly' then
    v_period_start := date_trunc('month', now());
    v_period_end   := v_period_start + interval '1 month';
    select coalesce(sum(quantity),0)::integer into v_used
      from lit_usage_ledger
     where feature_key = p_feature_key and created_at >= v_period_start and created_at < v_period_end
       and ((p_org_id is not null and org_id = p_org_id) or (p_user_id is not null and user_id = p_user_id));
  elsif v_kind = 'total' and p_feature_key = 'saved_company' then
    -- Demo-seeded rows (auto-provisioned on signup) do not consume the
    -- user's save allowance — only rows the user actually saved count.
    select count(*)::integer into v_used from lit_saved_companies
     where user_id = p_user_id and coalesce(source,'user') <> 'demo_seed';
  elsif v_kind = 'total' and p_feature_key = 'saved_pulse_list' then
    begin
      execute 'select count(*)::integer from pulse_saved_lists where owner_user_id = $1' into v_used using p_user_id;
    exception when undefined_table then
      select coalesce(sum(quantity),0)::integer into v_used from lit_usage_ledger
       where feature_key='saved_pulse_list' and ((p_org_id is not null and org_id=p_org_id) or (p_user_id is not null and user_id=p_user_id));
    end;
  elsif v_kind = 'total' and p_feature_key = 'saved_contact' then
    begin
      execute 'select count(*)::integer from lit_contacts where saved_by_user_id = $1' into v_used using p_user_id;
    exception when undefined_column or undefined_table then v_used := 0;
    end;
  elsif v_kind = 'seat' and p_feature_key = 'team_invite' then
    if p_org_id is not null then select count(*)::integer into v_used from org_members where org_id = p_org_id; else v_used := 0; end if;
  elsif v_kind = 'total' then
    -- generic lifetime ledger sum (covers saved_map_view + any future total key)
    select coalesce(sum(quantity),0)::integer into v_used from lit_usage_ledger
     where feature_key = p_feature_key and ((p_org_id is not null and org_id=p_org_id) or (p_user_id is not null and user_id=p_user_id));
  end if;

  if p_user_id is not null and public.is_platform_admin(p_user_id) then v_is_admin := true; end if;

  if v_is_admin then
    return jsonb_build_object('ok',true,'admin_bypass',true,'feature',p_feature_key,'used',v_used,'limit',v_limit,'plan',v_plan_code,
      'reset_at', case when v_kind='monthly' then v_period_end else null end);
  end if;

  if v_limit is null then
    return jsonb_build_object('ok',true,'feature',p_feature_key,'used',null,'limit',null,'plan',v_plan_code,'reset_at',null);
  end if;

  if (v_used + p_quantity) > v_limit then
    return jsonb_build_object('ok',false,'code','LIMIT_EXCEEDED','feature',p_feature_key,'used',v_used,'limit',v_limit,'plan',v_plan_code,
      'reset_at', case when v_kind='monthly' then v_period_end else null end,
      'upgrade_url','/app/billing','upgrade_required',true,
      'message', format('%s plan includes %s %s. Upgrade to continue.', initcap(v_plan_code), v_limit, replace(p_feature_key,'_',' ')));
  end if;

  return jsonb_build_object('ok',true,'feature',p_feature_key,'used',v_used,'limit',v_limit,'plan',v_plan_code,
    'reset_at', case when v_kind='monthly' then v_period_end else null end);
end;
$function$;

-- ── 5. curated demo-seed list (config row — editable without deploys) ───────
-- All 10 verified to have rich lit_importyeti_company_snapshot payloads
-- (raw_payload 100KB–580KB + parsed_summary) as of 2026-08-13.
INSERT INTO public.lit_internal_meta (meta_key, meta_value, updated_at)
SELECT 'demo_seed_companies',
       jsonb_agg(
         jsonb_build_object(
           'company_id', c.id,
           'source_company_key', c.source_company_key,
           'name', c.name
         )
         ORDER BY c.shipments_12m DESC NULLS LAST
       ),
       now()
FROM public.lit_companies c
WHERE c.source_company_key IN (
  'amazon-logistics',
  'home-depot-usa',
  'walmart-508-sw-8th-st',
  'samsung-electronics-america',
  'costco-wholesale-canada',
  'tesla',
  'adidas-international-trade',
  'ford-motor',
  'toyota-motor-sales-usa',
  'nike-usa'
)
ON CONFLICT (meta_key) DO UPDATE
  SET meta_value = EXCLUDED.meta_value, updated_at = now();

-- ── 6. seed on signup (NEW users only — trigger fires on auth.users INSERT) ─
CREATE OR REPLACE FUNCTION public.handle_new_user_org_bootstrap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id uuid;
  full_name  text;
BEGIN
  -- Skip bootstrap if the user was invited (already has an org_invites row pending)
  IF EXISTS (
    SELECT 1 FROM org_invites
    WHERE email = NEW.email AND status = 'pending'
  ) THEN
    RETURN NEW;
  END IF;

  -- Skip if user already has an org membership (re-trigger guard)
  IF EXISTS (
    SELECT 1 FROM org_members WHERE user_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Derive display name
  full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'display_name',
    split_part(NEW.email, '@', 1)
  );

  -- Create a personal workspace for the new user
  INSERT INTO organizations (name, owner_id)
  VALUES (full_name || '''s Workspace', NEW.id)
  RETURNING id INTO new_org_id;

  -- Add user as owner (org_members has no status column)
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  -- Seed a free_trial subscription (subscriptions has no org_id or started_at)
  INSERT INTO subscriptions (user_id, plan_code, status)
  VALUES (NEW.id, 'free_trial', 'trialing')
  ON CONFLICT (user_id) DO NOTHING;

  -- Demo seed companies (CEO 2026-08-13): every NEW user starts with the
  -- curated list from lit_internal_meta['demo_seed_companies'] pre-saved so
  -- the dashboard / Command Center are populated on first login.
  -- source='demo_seed' rows are EXCLUDED from the saved_company usage cap
  -- (see check_usage_limit). Idempotent; a seeding failure never blocks signup.
  BEGIN
    INSERT INTO lit_saved_companies
      (user_id, org_id, company_id, stage, status, source, source_company_key)
    SELECT NEW.id, new_org_id, c.id, 'lead', 'active', 'demo_seed', c.source_company_key
    FROM lit_internal_meta m
    CROSS JOIN LATERAL jsonb_array_elements(m.meta_value) AS e
    JOIN lit_companies c ON c.id = (e->>'company_id')::uuid
    WHERE m.meta_key = 'demo_seed_companies'
      AND jsonb_typeof(m.meta_value) = 'array'
    ON CONFLICT (user_id, company_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'demo_seed insert failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
