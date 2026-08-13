-- Org-scoped saved-company sharing + collision awareness (CEO directive 2026-08-13).
--
-- 1) organizations.saved_sharing_enabled — per-org "Account sharing" toggle
--    (Settings → Workspace, owner/admin only). Default ON: org members see
--    each other's saved companies (shared saves, SAVED badge, collision
--    cards). OFF: saves are private to each member.
--
-- 2) lit_saved_companies SELECT policy rewrite. The previous policy was:
--      (org_id IS NOT NULL) AND (org_id IN my-orgs OR EXISTS platform_admins)
--    Problems it caused:
--      a) The platform_admins branch made the "SAVED" badge in Company
--         Search reflect saves GLOBALLY for platform admins (badge is
--         derived client-side from an RLS-scoped lit_saved_companies read
--         in fetchSearchMetadataOverlay). Admin bypass is server-side only
--         (CLAUDE.md rule #6); admin surfaces use the service role, which
--         bypasses RLS anyway.
--      b) Org visibility was unconditional — no way to turn sharing off.
--      c) Rows with org_id IS NULL (legacy solo saves) were invisible even
--         to their own author.
--    New policy: your own rows always; org-mates' rows only when the org's
--    saved_sharing_enabled toggle is ON and you are an active member.
--
-- GRANTS: authenticated already holds SELECT on lit_saved_companies,
-- org_members and organizations (verified via information_schema
-- role_table_grants on 2026-08-13), but we re-issue them explicitly —
-- policies without base grants read as empty (recent prod bug).

alter table public.organizations
  add column if not exists saved_sharing_enabled boolean not null default true;

comment on column public.organizations.saved_sharing_enabled is
  'Workspace "Account sharing" toggle (owner/admin controlled). ON = org members see each other''s saved companies (shared lists, SAVED badges, collision cards). OFF = saves are private per member.';

drop policy if exists lit_saved_companies_select on public.lit_saved_companies;

create policy lit_saved_companies_select
  on public.lit_saved_companies
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      org_id is not null
      and exists (
        select 1
        from public.org_members om
        join public.organizations o on o.id = om.org_id
        where om.org_id = lit_saved_companies.org_id
          and om.user_id = auth.uid()
          and om.status = 'active'
          and o.saved_sharing_enabled
      )
    )
  );

-- Explicit base grants (see header note).
grant select on public.lit_saved_companies to authenticated;
grant select on public.org_members to authenticated;
grant select on public.organizations to authenticated;
grant update (saved_sharing_enabled) on public.organizations to authenticated;
