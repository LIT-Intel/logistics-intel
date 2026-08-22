-- ============================================================================
-- Project Harvey — sequence copy v2 (company-optional, no blank merges).
--
-- The first template rendered "{{company}}" empty when a lead had no company
-- (many LEAD-CRM leads do), producing broken lines like "Quick idea for 's
-- outbound" and "brokerages like  lose hours". Fix: {{company}} is now used in
-- ONLY the "<Brokerages/Forwarders/3PLs> like {{company}}" opener, which reads
-- naturally both ways ("like MODE Transportation" / render fallback "like
-- yours"). Subjects and every possessive were reworded to not need a company
-- token, so a missing company can never leave a blank or an awkward phrase.
--
-- Applied as in-place UPDATEs (NOT delete+reinsert) so step IDs are preserved —
-- in-flight lit_campaign_contacts.current_step_id references stay valid.
-- Idempotent: safe to re-run.
-- ============================================================================

do $$
declare
  broker uuid := 'c0a1efab-0000-4000-8000-000000000001';
  fwd    uuid := 'c0a1efab-0000-4000-8000-000000000002';
  tpl    uuid := 'c0a1efab-0000-4000-8000-000000000003';
  cal    text := 'https://cal.com/logisticintel/30min';
begin
  -- ───── BROKERS ─────
  update public.lit_campaign_steps set subject='Quick idea for your outbound', body=
'Hi {{first_name}},

Brokerages like {{company}} lose hours a week guessing which shippers are actually moving freight. Logistic Intel turns real bill-of-lading + shipment data into a working list of importers/exporters and the decision-makers behind them — so your desk prospects accounts that are already moving volume.

Worth a quick look?

— Harvey, Logistic Intel
Grab 30 min: ' || cal where campaign_id=broker and step_order=1;

  update public.lit_campaign_steps set subject=null, body=
'Hi {{first_name}} — I work with freight brokers on finding shippers that are actually moving volume (real BOL data, not stale lists). Would love to connect and share what we''re seeing on your lanes.' where campaign_id=broker and step_order=2;

  update public.lit_campaign_steps set subject='Re: shippers already moving freight', body=
'Hi {{first_name}},

Following up — the teams that win new accounts fastest reach shippers right after a volume spike. LIT flags those shifts and hands you the contact. Happy to run a couple of your target lanes live so you can see it.

Open to a 30-min look? ' || cal || '

— Harvey' where campaign_id=broker and step_order=3;

  update public.lit_campaign_steps set subject=null, body=
'Thanks for connecting, {{first_name}}! If it''s useful, I can pull a quick list of importers moving freight on the lanes your team focuses on — no strings. Want me to send a sample?' where campaign_id=broker and step_order=4;

  update public.lit_campaign_steps set subject='The accounts I''d call this week', body=
'Hi {{first_name}},

If I were prospecting for your desk this week, I''d start with shippers showing new import volume on your core lanes. LIT builds that list automatically and keeps it current — most brokers we work with book 2-3 extra discovery calls a week from it.

Want me to set you up with a trial? ' || cal || '

— Harvey' where campaign_id=broker and step_order=5;

  update public.lit_campaign_steps set subject='Should I close this out?', body=
'Hi {{first_name}},

Haven''t heard back, so I''ll assume the timing''s off right now — no worries. If finding shippers that are already moving freight ever moves up your list, the door''s open.

Here if you want it: ' || cal || '

— Harvey' where campaign_id=broker and step_order=6;

  -- ───── FORWARDERS ─────
  update public.lit_campaign_steps set subject='Ocean + air volume you aren''t seeing yet', body=
'Hi {{first_name}},

Forwarders like {{company}} win by reaching shippers before the incumbent renews. Logistic Intel reads real ocean/air BOL data to show which importers are moving volume, on which lanes, and who to call — so your team targets live opportunities instead of cold lists.

Worth 30 min to see it on your trade lanes? ' || cal || '

— Harvey, Logistic Intel' where campaign_id=fwd and step_order=1;

  update public.lit_campaign_steps set subject=null, body=
'Hi {{first_name}} — I help forwarders spot shippers moving ocean/air volume on their lanes (real BOL data). Would love to connect and share what we''re seeing on your lanes.' where campaign_id=fwd and step_order=2;

  update public.lit_campaign_steps set subject='Re: importers on your lanes', body=
'Hi {{first_name}},

Quick follow-up — the forwarders growing fastest reach importers right when volume shifts to their strong lanes. LIT surfaces those shippers and the decision-maker. Happy to run your top trade lanes live.

30-min look? ' || cal || '

— Harvey' where campaign_id=fwd and step_order=3;

  update public.lit_campaign_steps set subject=null, body=
'Thanks for connecting, {{first_name}}! I can pull a sample of importers moving volume on your main lanes if that''s useful — want me to send it over?' where campaign_id=fwd and step_order=4;

  update public.lit_campaign_steps set subject='Shippers moving to your lanes this month', body=
'Hi {{first_name}},

I''d focus on importers whose volume is shifting toward the lanes you''re strongest on — that''s where forwarders displace incumbents. LIT builds and refreshes that target list for your team automatically.

Want a trial to try it on your book? ' || cal || '

— Harvey' where campaign_id=fwd and step_order=5;

  update public.lit_campaign_steps set subject='Close this out?', body=
'Hi {{first_name}},

No reply, so I''ll assume now''s not the moment — all good. If targeting shippers by real ocean/air volume ever climbs your list, we''re here.

' || cal || '

— Harvey' where campaign_id=fwd and step_order=6;

  -- ───── 3PLs ─────
  update public.lit_campaign_steps set subject='Finding shippers that fit your services', body=
'Hi {{first_name}},

3PLs like {{company}} grow fastest when sales reaches shippers whose freight actually fits their services. Logistic Intel uses real shipment data to show which importers/exporters are moving volume and who owns the decision — so your team pitches accounts that fit, not random lists.

Worth a quick look? ' || cal || '

— Harvey, Logistic Intel' where campaign_id=tpl and step_order=1;

  update public.lit_campaign_steps set subject=null, body=
'Hi {{first_name}} — I work with 3PLs on finding shippers whose freight fits their services (real shipment data). Would love to connect and share what we''re seeing.' where campaign_id=tpl and step_order=2;

  update public.lit_campaign_steps set subject='Re: accounts that fit your services', body=
'Hi {{first_name}},

Following up — the 3PLs adding logos fastest reach shippers right as their volume grows. LIT flags that and hands your rep the contact. Happy to run your ICP live so you can see the fit.

30 min? ' || cal || '

— Harvey' where campaign_id=tpl and step_order=3;

  update public.lit_campaign_steps set subject=null, body=
'Thanks for connecting, {{first_name}}! I can pull a quick sample of shippers whose freight fits your services — want me to send it?' where campaign_id=tpl and step_order=4;

  update public.lit_campaign_steps set subject='The accounts I''d target for you', body=
'Hi {{first_name}},

If I were building your pipeline this week, I''d target shippers with growing volume that matches your services. LIT builds that list and keeps it fresh, so reps spend time selling, not researching.

Want a trial on your book? ' || cal || '

— Harvey' where campaign_id=tpl and step_order=5;

  update public.lit_campaign_steps set subject='Should I close this out?', body=
'Hi {{first_name}},

Haven''t heard back — I''ll assume the timing''s off, no worries. If finding shippers that fit your services ever moves up the list, the door''s open.

' || cal || '

— Harvey' where campaign_id=tpl and step_order=6;
end $$;
