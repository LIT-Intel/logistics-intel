-- Make Unipile LinkedIn connected accounts PER-USER, not org-wide.
--
-- Bug: 20260817220000_unipile_linkedin_outreach.sql scoped
-- lit_unipile_accounts reads by org_id only, so every active member of a
-- workspace could see (and send from) any teammate's connected LinkedIn.
-- Each user must connect and use their OWN LinkedIn account. Accounts stay
-- within the org, but visibility + selection are gated to the owning user
-- (auth.uid()). Platform admins retain read for support.
--
-- The account table already has owner_user_id (not null, references
-- auth.users), and every existing row is populated (verified: 2 rows, 0 null
-- owners), so this migration only tightens the RLS/index — no backfill of a
-- new column is required and no existing row is orphaned.
--
-- Idempotent. NOT YET APPLIED to prod — apply via supabase db push / MCP
-- apply_migration after review.

begin;

-- Owner-scoped lookup index for the per-user list + send paths.
create index if not exists lit_unipile_accounts_owner_status_idx
  on public.lit_unipile_accounts (owner_user_id, status);

-- SELECT: a member sees ONLY their own connected LinkedIn accounts (still
-- necessarily within an org they belong to). Platform admins keep read for
-- support/debugging. Replaces the org-wide select policy.
drop policy if exists lit_unipile_accounts_select on public.lit_unipile_accounts;
create policy lit_unipile_accounts_select on public.lit_unipile_accounts for select using (
  (
    owner_user_id = auth.uid()
    and exists (select 1 from public.org_members om
                where om.org_id = lit_unipile_accounts.org_id
                  and om.user_id = auth.uid() and om.status = 'active')
  )
  or public.is_platform_admin(auth.uid())
);

-- UPDATE/write: only the owning user may mutate their own sender settings.
-- (Previously org owners/admins could edit any member's account — that
-- conflicts with per-user ownership of a personal LinkedIn login.) Platform
-- admins retain write for support.
drop policy if exists lit_unipile_accounts_write on public.lit_unipile_accounts;
create policy lit_unipile_accounts_write on public.lit_unipile_accounts for update using (
  (
    owner_user_id = auth.uid()
    and exists (select 1 from public.org_members om
                where om.org_id = lit_unipile_accounts.org_id
                  and om.user_id = auth.uid() and om.status = 'active')
  )
  or public.is_platform_admin(auth.uid())
);

comment on table public.lit_unipile_accounts is
  'Per-user Unipile connected accounts. Each row is owned by owner_user_id; a member sees and sends from only their OWN LinkedIn accounts (scoped by auth.uid()) within their org. A user may hold more than one provider account.';

commit;
