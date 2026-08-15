-- Lead-CRM Phase 1 — Part 3a: monotonic stage-derive function.
-- Returns a stage POSITION (0..4, excluding Lost which is manual-only) from boolean signals.
-- Natural progression:
--   Subscriber(4) if paid/active subscription OR converted_paid_at
--   Trial(3)      if trial started
--   Engaged(2)    if any search/save/email open+click/product activity
--   Contacted(1)  if any outbound (outreach/demo sent)
--   New(0)        otherwise
--
-- MONOTONIC RULE (enforced by callers): the derived position is only ever used to
-- ADVANCE a lead. A lead's stage is never auto-downgraded below its current position,
-- and once at Subscriber it never regresses. Manual moves set lit_admin_leads.manual_override,
-- after which auto-derive must not touch the stage at all.
create or replace function public.lead_derived_stage(
  p_is_subscriber boolean,
  p_is_trial      boolean,
  p_is_engaged    boolean,
  p_is_contacted  boolean
)
returns int
language sql
immutable
as $$
  select case
    when coalesce(p_is_subscriber, false) then 4
    when coalesce(p_is_trial, false)      then 3
    when coalesce(p_is_engaged, false)    then 2
    when coalesce(p_is_contacted, false)  then 1
    else 0
  end;
$$;
