-- Hard-delete a user + their full auto-provisioned footprint (org, membership,
-- subscription, demo-seed saved companies, CRM/activation/referral rows, profile),
-- then the auth account. This is why the admin "delete" failed on bot signups —
-- the signup trigger creates FK'd rows that block a raw auth.users delete.
-- Only purges a solely-owned org (never a shared workspace). Platform-admin gated.

create or replace function public.lit_admin_purge_user(p_user_id uuid, p_confirm boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_orgs uuid[]; v_email text;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'not authorized'; end if;
  if p_confirm is not true then return jsonb_build_object('ok', false, 'reason', 'confirm_required'); end if;
  if p_user_id = auth.uid() then return jsonb_build_object('ok', false, 'reason', 'cannot_purge_self'); end if;

  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  select array_agg(o.id) into v_orgs
  from organizations o
  where o.owner_id = p_user_id
    and not exists (select 1 from org_members m where m.org_id = o.id and m.user_id <> p_user_id);

  begin update lit_broadcasts set created_by=null where created_by=p_user_id; exception when others then null; end;
  begin update lit_fmcsa_import_runs set triggered_by=null where triggered_by=p_user_id; exception when others then null; end;
  begin update lit_outreach_safety_holds set cleared_by=null where cleared_by=p_user_id; exception when others then null; end;
  begin update lit_recipient_consent set attested_by_user_id=null where attested_by_user_id=p_user_id; exception when others then null; end;
  begin update pulse_list_companies set added_by=null where added_by=p_user_id; exception when others then null; end;
  begin update pulse_list_contacts set added_by=null where added_by=p_user_id; exception when others then null; end;
  begin update pulse_list_inbox set resolved_by=null where resolved_by=p_user_id; exception when others then null; end;

  begin delete from lit_lead_activity where lead_id in (select id from lit_admin_leads where user_id=p_user_id); exception when others then null; end;
  begin delete from lit_lead_tasks where lead_id in (select id from lit_admin_leads where user_id=p_user_id); exception when others then null; end;
  begin delete from lit_admin_leads where user_id=p_user_id; exception when others then null; end;
  begin delete from lit_referral_rewards where referrer_user_id=p_user_id or referred_user_id=p_user_id; exception when others then null; end;
  begin delete from lit_referral_events where user_id=p_user_id; exception when others then null; end;
  begin delete from lit_user_referrals where user_id=p_user_id; exception when others then null; end;
  begin delete from lit_lifecycle_sends where user_id=p_user_id; exception when others then null; end;
  begin delete from lit_user_activation where user_id=p_user_id; exception when others then null; end;
  begin delete from lit_lead_magnet_sessions where user_id=p_user_id; exception when others then null; end;
  begin delete from lit_activity_events where user_id=p_user_id; exception when others then null; end;
  begin delete from lit_usage_ledger where user_id=p_user_id; exception when others then null; end;
  begin delete from lit_saved_companies where user_id=p_user_id or org_id = any(v_orgs); exception when others then null; end;
  begin delete from subscriptions where user_id=p_user_id or organization_id = any(v_orgs); exception when others then null; end;
  begin delete from org_members where user_id=p_user_id or org_id = any(v_orgs); exception when others then null; end;
  begin delete from org_memberships where user_id=p_user_id or org_id = any(v_orgs); exception when others then null; end;
  begin delete from organizations where id = any(v_orgs); exception when others then null; end;
  begin delete from lit_signup_spam_log where user_id=p_user_id; exception when others then null; end;
  begin delete from profiles where id=p_user_id; exception when others then null; end;

  delete from auth.users where id = p_user_id;
  return jsonb_build_object('ok', true, 'purged_user', v_email, 'purged_orgs', coalesce(array_length(v_orgs,1),0));
end;
$$;
revoke all on function public.lit_admin_purge_user(uuid, boolean) from public, anon;
grant execute on function public.lit_admin_purge_user(uuid, boolean) to authenticated, service_role;

-- Bulk: purge every suspended+banned gibberish-name bot that never signed in.
create or replace function public.lit_admin_purge_spam(p_confirm boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid; v_count int := 0;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'not authorized'; end if;
  if p_confirm is not true then return jsonb_build_object('ok', false, 'reason', 'confirm_required'); end if;
  for v_id in
    select id from auth.users
    where lit_is_gibberish_name(coalesce(raw_user_meta_data->>'full_name',''))
      and banned_until is not null and last_sign_in_at is null
  loop
    perform public.lit_admin_purge_user(v_id, true);
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'purged', v_count);
end;
$$;
revoke all on function public.lit_admin_purge_spam(boolean) from public, anon;
grant execute on function public.lit_admin_purge_spam(boolean) to authenticated, service_role;
