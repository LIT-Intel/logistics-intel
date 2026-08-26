-- Keep internal Lead-CRM leads out of the customer-facing Command Center (2026-08-26)
--
-- The Command Center "Accounts" tab reads lit_saved_companies. apollo-contact-enrich
-- auto-saves a company into lit_saved_companies whenever its contacts are enriched
-- (so lit_contacts SELECT RLS lets the user see the result). When a Lead-CRM member
-- enriched a broker/forwarder LEAD (lit_admin_leads), that auto-save leaked the lead
-- into the Command Center — 19 such rows were found and removed. The two CRMs are
-- meant to be separate surfaces.
--
-- App-level fix: supabase/functions/apollo-contact-enrich skips the auto-save when the
-- company is a Lead-CRM lead. This migration adds the DB-level guarantee so it can
-- never recur regardless of code path: a BEFORE INSERT trigger on lit_saved_companies
-- silently skips any row whose company is an active (non-deleted, non-merged) lead.

create or replace function public.lit_saved_companies_block_lead_crm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is not null
     and exists (
       select 1 from public.lit_admin_leads al
       where al.company_id = new.company_id
         and al.deleted_at is null
         and al.merged_into_lead_id is null
     ) then
    return null; -- silently skip; the enrichment auto-save is non-fatal
  end if;
  return new;
end;
$$;

drop trigger if exists trg_saved_companies_block_lead_crm on public.lit_saved_companies;
create trigger trg_saved_companies_block_lead_crm
  before insert on public.lit_saved_companies
  for each row execute function public.lit_saved_companies_block_lead_crm();
