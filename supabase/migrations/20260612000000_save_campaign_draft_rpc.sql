-- CR P0-3 fix: atomic save for campaign drafts.
--
-- Replaces the 4-step client-side sequence (createCampaignDraft +
-- attach/setCampaignCompanies + upsertCampaignStep xN + deleteStepsFrom)
-- with a single transactional RPC. A PL/pgSQL function runs inside an
-- implicit transaction: any RAISE rolls back ALL writes, so a mid-sequence
-- step failure can no longer leave the campaign in a partial state.
--
-- SECURITY DEFINER + an explicit user_id arg lets the edge function pass the
-- verified JWT subject and have RLS-equivalent ownership checks inside the
-- body. The edge function is the only intended caller; direct anon/auth
-- callers will hit the EXECUTE grant gate below.

CREATE OR REPLACE FUNCTION public.save_campaign_draft(
  p_user_id        uuid,
  p_campaign_id    uuid,        -- null => create new draft
  p_name           text,
  p_channel        text,
  p_metrics        jsonb,
  p_scheduled_start_at timestamptz,
  p_send_timezone  text,
  p_company_ids    uuid[],
  p_steps          jsonb,        -- array of step objects in desired order
  p_replace_companies boolean    -- true = diff (edit mode), false = additive (create mode)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id  uuid;
  v_org_id       uuid;
  v_is_edit      boolean := p_campaign_id IS NOT NULL;
  v_step         jsonb;
  v_order        int := 0;
  v_step_ids     uuid[] := ARRAY[]::uuid[];
  v_step_id      uuid;
  v_company_id   uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'save_campaign_draft: p_user_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'save_campaign_draft: name is required' USING ERRCODE = '22023';
  END IF;

  -- Resolve org for create path / verify ownership for edit path.
  IF v_is_edit THEN
    SELECT org_id INTO v_org_id
      FROM public.lit_campaigns
      WHERE id = p_campaign_id
        AND (
          user_id = p_user_id
          OR EXISTS (
            SELECT 1 FROM public.org_members om
              WHERE om.org_id = lit_campaigns.org_id
                AND om.user_id = p_user_id
                AND om.role IN ('owner','admin')
                AND om.status = 'active'
          )
        );
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'save_campaign_draft: campaign not found or not owned by user'
        USING ERRCODE = '42501';
    END IF;
    v_campaign_id := p_campaign_id;

    UPDATE public.lit_campaigns SET
      name = p_name,
      channel = COALESCE(p_channel, channel),
      metrics = COALESCE(p_metrics, metrics),
      scheduled_start_at = p_scheduled_start_at,
      send_timezone = COALESCE(p_send_timezone, send_timezone),
      updated_at = now()
    WHERE id = v_campaign_id;
  ELSE
    -- Resolve org from the caller's first active membership (mirrors
    -- resolveActiveOrgIdOrThrow in frontend/src/lib/api.ts).
    SELECT om.org_id INTO v_org_id
      FROM public.org_members om
      WHERE om.user_id = p_user_id
        AND om.status = 'active'
      ORDER BY om.joined_at ASC
      LIMIT 1;
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'save_campaign_draft: user has no active org membership'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.lit_campaigns (user_id, org_id, name, channel, status, metrics, scheduled_start_at, send_timezone)
      VALUES (
        p_user_id,
        v_org_id,
        p_name,
        COALESCE(p_channel, 'email'),
        'draft',
        COALESCE(p_metrics, '{}'::jsonb),
        p_scheduled_start_at,
        COALESCE(p_send_timezone, 'UTC')
      )
      RETURNING id INTO v_campaign_id;
  END IF;

  -- Companies. Edit-mode = full diff; create-mode = additive insert.
  IF p_replace_companies THEN
    DELETE FROM public.lit_campaign_companies
      WHERE campaign_id = v_campaign_id
        AND (p_company_ids IS NULL OR NOT (company_id = ANY (p_company_ids)));
  END IF;

  IF p_company_ids IS NOT NULL AND array_length(p_company_ids, 1) IS NOT NULL THEN
    FOREACH v_company_id IN ARRAY p_company_ids LOOP
      INSERT INTO public.lit_campaign_companies (campaign_id, company_id)
        VALUES (v_campaign_id, v_company_id)
        ON CONFLICT (campaign_id, company_id) DO NOTHING;
    END LOOP;
  END IF;

  -- Steps. Iterate the array in order; step_order is 1-based by position
  -- in p_steps. Upsert keyed on (campaign_id, step_order). Any step that
  -- raises (e.g. invalid step_type) aborts the whole function -> rollback.
  IF p_steps IS NOT NULL THEN
    FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
      v_order := v_order + 1;

      INSERT INTO public.lit_campaign_steps (
        campaign_id,
        user_id,
        step_order,
        channel,
        step_type,
        subject,
        body,
        delay_days,
        delay_hours,
        delay_minutes,
        subject_b,
        include_signature,
        metadata
      ) VALUES (
        v_campaign_id,
        p_user_id,
        v_order,
        COALESCE(v_step->>'channel', 'email'),
        COALESCE(v_step->>'step_type', 'email'),
        NULLIF(v_step->>'subject', ''),
        NULLIF(v_step->>'body', ''),
        COALESCE((v_step->>'delay_days')::int, 0),
        COALESCE((v_step->>'delay_hours')::int, 0),
        COALESCE((v_step->>'delay_minutes')::int, 0),
        NULLIF(v_step->>'subject_b', ''),
        COALESCE((v_step->>'include_signature')::boolean, true),
        COALESCE(v_step->'metadata', '{}'::jsonb)
      )
      ON CONFLICT (campaign_id, step_order) DO UPDATE SET
        channel           = EXCLUDED.channel,
        step_type         = EXCLUDED.step_type,
        subject           = EXCLUDED.subject,
        body              = EXCLUDED.body,
        delay_days        = EXCLUDED.delay_days,
        delay_hours       = EXCLUDED.delay_hours,
        delay_minutes     = EXCLUDED.delay_minutes,
        subject_b         = EXCLUDED.subject_b,
        include_signature = EXCLUDED.include_signature,
        metadata          = EXCLUDED.metadata,
        updated_at        = now()
      RETURNING id INTO v_step_id;

      v_step_ids := array_append(v_step_ids, v_step_id);
    END LOOP;
  END IF;

  -- Cleanup: drop leftover steps whose position is past the new sequence
  -- length. Runs in both create and edit mode (no-op in create when
  -- v_order is the only set).
  DELETE FROM public.lit_campaign_steps
    WHERE campaign_id = v_campaign_id
      AND step_order > v_order;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign_id,
    'is_edit', v_is_edit,
    'step_ids', to_jsonb(v_step_ids),
    'step_count', v_order
  );
END;
$$;

-- Restrict execution to service_role only; the edge function is the
-- intended caller and presents service-role auth after verifying the JWT.
REVOKE ALL ON FUNCTION public.save_campaign_draft(uuid, uuid, text, text, jsonb, timestamptz, text, uuid[], jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_campaign_draft(uuid, uuid, text, text, jsonb, timestamptz, text, uuid[], jsonb, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_campaign_draft(uuid, uuid, text, text, jsonb, timestamptz, text, uuid[], jsonb, boolean) TO service_role;

COMMENT ON FUNCTION public.save_campaign_draft IS
  'CR P0-3: atomic create/update of a campaign draft (basics + companies + steps). Service-role only; called by the save-campaign-draft edge function after JWT verification.';
