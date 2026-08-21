-- ============================================================================
-- Project Harvey — standing ICP campaigns + multichannel sequences.
--
-- The owner's vision: "Harvey harvests leads from the LEAD CRM, creates a
-- campaign for freight brokers and one for freight forwarders, adds leads, and
-- activates the campaign to send email + LinkedIn."
--
-- This migration creates THREE standing, always-on campaigns (one per ICP) that
-- are VISIBLE in the Campaign page, each with a 6-step multichannel sequence
-- (email + LinkedIn invite + LinkedIn message). Harvey enrolls workable LEAD-CRM
-- leads into the matching campaign (harvey-sequence-tick) and drives each
-- enrolled contact through the steps by emitting APPROVED lit_agent_drafts,
-- which harvey-email-dispatch / harvey-linkedin-dispatch then send.
--
-- WHY A SEPARATE STATUS ('harvey_active') FOR ENROLLED CONTACTS:
--   The customer campaign cron (send-campaign-email) selects
--   lit_campaign_contacts WHERE status IN ('pending','queued'). If Harvey's
--   contacts used those statuses, that cron would ALSO process them and
--   double-send email (and PARK LinkedIn, which it can't send). Harvey's
--   contacts carry status='harvey_active', which the customer cron ignores;
--   harvey-sequence-tick is the ONLY engine that advances them. This cleanly
--   separates the two send paths while keeping the rows visible as campaign
--   members.
--
-- Ownership: campaigns are owned by the platform OWNER (so they appear in the
-- owner's Campaign page) but tagged metrics.internal_agent='harvey'. The lead
-- ASSIGNEE (lit_admin_leads.assigned_to) is set to Harvey's synthetic identity
-- by harvey-sequence-tick, so "Harvey (AI SDR)" shows as the working rep.
--
-- IDEMPOTENT: fixed campaign UUIDs; steps are deleted + re-inserted so
-- re-applying refreshes the sequence copy without duplicating.
-- ============================================================================

do $$
declare
  owner_uid  uuid := '79c81c33-3321-4e56-a442-80c74bb887b8';
  owner_org  uuid := '7a16be7f-b6b9-499e-8618-533373970f7c';
  broker_cid uuid := 'c0a1efab-0000-4000-8000-000000000001';
  fwd_cid    uuid := 'c0a1efab-0000-4000-8000-000000000002';
  tpl_cid    uuid := 'c0a1efab-0000-4000-8000-000000000003';
  cal        text := 'https://cal.com/logisticintel/30min';
begin
  -- ── campaigns (upsert by fixed id) ───────────────────────────────────────
  insert into public.lit_campaigns (id, user_id, org_id, name, status, channel, is_admin_only, send_timezone, metrics)
  values
    (broker_cid, owner_uid, owner_org, 'Harvey · Freight Brokers (Cold Outreach)', 'active', 'multichannel', true, 'America/New_York',
      jsonb_build_object('internal_agent','harvey','icp','freight_broker','assignee','Harvey (AI SDR)','managed_by','harvey-sequence-tick')),
    (fwd_cid, owner_uid, owner_org, 'Harvey · Freight Forwarders / NVOCC (Cold Outreach)', 'active', 'multichannel', true, 'America/New_York',
      jsonb_build_object('internal_agent','harvey','icp','freight_forwarder','assignee','Harvey (AI SDR)','managed_by','harvey-sequence-tick')),
    (tpl_cid, owner_uid, owner_org, 'Harvey · 3PLs (Cold Outreach)', 'active', 'multichannel', true, 'America/New_York',
      jsonb_build_object('internal_agent','harvey','icp','third_party_logistics','assignee','Harvey (AI SDR)','managed_by','harvey-sequence-tick'))
  on conflict (id) do update
    set name = excluded.name, status = excluded.status, channel = excluded.channel,
        is_admin_only = excluded.is_admin_only, metrics = excluded.metrics, updated_at = now();

  -- ── refresh steps (delete + re-insert for idempotent copy updates) ───────
  delete from public.lit_campaign_steps where campaign_id in (broker_cid, fwd_cid, tpl_cid);

  -- Steps carry channel ('email'|'linkedin'); LinkedIn steps use
  -- metadata.kind ('invite'|'message') so the executor picks the right draft
  -- shape. Merge tokens {{first_name}} and {{company}} are rendered per lead.

  -- ─────────────── FREIGHT BROKERS ───────────────
  insert into public.lit_campaign_steps (campaign_id, user_id, step_order, channel, step_type, subject, body, delay_days, delay_hours, metadata) values
  (broker_cid, owner_uid, 1, 'email', 'email', 'Quick idea for {{company}}''s outbound',
'Hi {{first_name}},

Reps at brokerages like {{company}} lose hours a week guessing which shippers are actually moving freight. Logistic Intel turns real bill-of-lading + shipment data into a working list of importers/exporters and the decision-makers behind them — so your desk prospects accounts that are already moving volume.

Worth a quick look?

— Harvey, Logistic Intel
Grab 30 min: ' || cal, 0, 0, '{"kind":"intro"}'),
  (broker_cid, owner_uid, 2, 'linkedin', 'linkedin', null,
'Hi {{first_name}} — I work with freight brokers on finding shippers that are actually moving volume (real BOL data, not stale lists). Would love to connect and share what we''re seeing on {{company}}''s lanes.', 2, 0, '{"kind":"invite"}'),
  (broker_cid, owner_uid, 3, 'email', 'email', 'Re: shippers already moving freight',
'Hi {{first_name}},

Following up — the teams that win new accounts fastest reach shippers right after a volume spike. LIT flags those shifts and hands you the contact. Happy to run a couple of {{company}}''s target lanes live so you can see it.

Open to a 30-min look? ' || cal || '

— Harvey', 4, 0, '{"kind":"followup"}'),
  (broker_cid, owner_uid, 4, 'linkedin', 'linkedin', null,
'Thanks for connecting, {{first_name}}! If it''s useful, I can pull a quick list of importers moving freight on the lanes {{company}} focuses on — no strings. Want me to send a sample?', 5, 0, '{"kind":"message"}'),
  (broker_cid, owner_uid, 5, 'email', 'email', 'The accounts I''d call this week',
'Hi {{first_name}},

If I were prospecting for {{company}} this week, I''d start with shippers showing new import volume on your core lanes. LIT builds that list automatically and keeps it current — most brokers we work with book 2-3 extra discovery calls a week from it.

Want me to set you up with a trial? ' || cal || '

— Harvey', 8, 0, '{"kind":"value"}'),
  (broker_cid, owner_uid, 6, 'email', 'email', 'Should I close this out?',
'Hi {{first_name}},

Haven''t heard back, so I''ll assume the timing''s off for {{company}} right now — no worries. If finding shippers that are already moving freight ever moves up your list, the door''s open.

Here if you want it: ' || cal || '

— Harvey', 12, 0, '{"kind":"breakup"}');

  -- ─────────────── FREIGHT FORWARDERS / NVOCC ───────────────
  insert into public.lit_campaign_steps (campaign_id, user_id, step_order, channel, step_type, subject, body, delay_days, delay_hours, metadata) values
  (fwd_cid, owner_uid, 1, 'email', 'email', 'Ocean + air volume {{company}} isn''t seeing yet',
'Hi {{first_name}},

Forwarders like {{company}} win by reaching shippers before the incumbent renews. Logistic Intel reads real ocean/air BOL data to show which importers are moving volume, on which lanes, and who to call — so your team targets live opportunities instead of cold lists.

Worth 30 min to see it on your trade lanes? ' || cal || '

— Harvey, Logistic Intel', 0, 0, '{"kind":"intro"}'),
  (fwd_cid, owner_uid, 2, 'linkedin', 'linkedin', null,
'Hi {{first_name}} — I help forwarders spot shippers moving ocean/air volume on their lanes (real BOL data). Would love to connect and share what we''re seeing around {{company}}.', 2, 0, '{"kind":"invite"}'),
  (fwd_cid, owner_uid, 3, 'email', 'email', 'Re: importers on your lanes',
'Hi {{first_name}},

Quick follow-up — the forwarders growing fastest reach importers right when volume shifts to their strong lanes. LIT surfaces those shippers and the decision-maker. Happy to run {{company}}''s top trade lanes live.

30-min look? ' || cal || '

— Harvey', 4, 0, '{"kind":"followup"}'),
  (fwd_cid, owner_uid, 4, 'linkedin', 'linkedin', null,
'Thanks for connecting, {{first_name}}! I can pull a sample of importers moving volume on {{company}}''s main lanes if that''s useful — want me to send it over?', 5, 0, '{"kind":"message"}'),
  (fwd_cid, owner_uid, 5, 'email', 'email', 'Shippers moving to your lanes this month',
'Hi {{first_name}},

For {{company}} I''d focus on importers whose volume is shifting toward the lanes you''re strongest on — that''s where forwarders displace incumbents. LIT builds and refreshes that target list for your team automatically.

Want a trial to try it on your book? ' || cal || '

— Harvey', 8, 0, '{"kind":"value"}'),
  (fwd_cid, owner_uid, 6, 'email', 'email', 'Close this out?',
'Hi {{first_name}},

No reply, so I''ll assume now''s not the moment for {{company}} — all good. If targeting shippers by real ocean/air volume ever climbs your list, we''re here.

' || cal || '

— Harvey', 12, 0, '{"kind":"breakup"}');

  -- ─────────────── 3PLs ───────────────
  insert into public.lit_campaign_steps (campaign_id, user_id, step_order, channel, step_type, subject, body, delay_days, delay_hours, metadata) values
  (tpl_cid, owner_uid, 1, 'email', 'email', 'Finding shippers that fit {{company}}''s services',
'Hi {{first_name}},

3PLs like {{company}} grow fastest when sales reaches shippers whose freight actually fits your services. Logistic Intel uses real shipment data to show which importers/exporters are moving volume and who owns the decision — so your team pitches accounts that fit, not random lists.

Worth a quick look? ' || cal || '

— Harvey, Logistic Intel', 0, 0, '{"kind":"intro"}'),
  (tpl_cid, owner_uid, 2, 'linkedin', 'linkedin', null,
'Hi {{first_name}} — I work with 3PLs on finding shippers whose freight fits their services (real shipment data). Would love to connect and share what fits {{company}}.', 2, 0, '{"kind":"invite"}'),
  (tpl_cid, owner_uid, 3, 'email', 'email', 'Re: accounts that fit your services',
'Hi {{first_name}},

Following up — the 3PLs adding logos fastest reach shippers right as their volume grows. LIT flags that and hands your rep the contact. Happy to run {{company}}''s ICP live so you can see the fit.

30 min? ' || cal || '

— Harvey', 4, 0, '{"kind":"followup"}'),
  (tpl_cid, owner_uid, 4, 'linkedin', 'linkedin', null,
'Thanks for connecting, {{first_name}}! I can pull a quick sample of shippers whose freight fits {{company}}''s services — want me to send it?', 5, 0, '{"kind":"message"}'),
  (tpl_cid, owner_uid, 5, 'email', 'email', 'The accounts I''d target for {{company}}',
'Hi {{first_name}},

If I were building {{company}}''s pipeline this week, I''d target shippers with growing volume that matches your services. LIT builds that list and keeps it fresh, so reps spend time selling, not researching.

Want a trial on your book? ' || cal || '

— Harvey', 8, 0, '{"kind":"value"}'),
  (tpl_cid, owner_uid, 6, 'email', 'email', 'Should I close this out?',
'Hi {{first_name}},

Haven''t heard back — I''ll assume the timing''s off for {{company}}, no worries. If finding shippers that fit your services ever moves up the list, the door''s open.

' || cal || '

— Harvey', 12, 0, '{"kind":"breakup"}');
end $$;
