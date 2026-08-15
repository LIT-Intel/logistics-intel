/**
 * Lead-CRM membership hook — server-authoritative access for the standalone
 * `/app/leads` workspace.
 *
 * Wraps `lit_my_lead_crm_access()` (SECURITY DEFINER RPC) in TanStack Query so
 * the answer is fetched once per session and shared by:
 *   - `RequireLeadCrm` (the route gate — renders the CRM only if is_member)
 *   - the sidebar nav link (shows the "Lead CRM" link only to members)
 *   - `TeamPage` (member management, gated on is_platform_admin)
 *
 * The RPC decides membership — a SALES REP (non-platform-admin) is let in
 * WITHOUT the rest of admin, purely on `is_member`. Defaults to "no access"
 * while loading / on error so nothing leaks before the server answers.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { myLeadCrmAccess, type LeadCrmAccess } from "@/api/leadCrm";

const LEAD_CRM_ACCESS_KEY = ["lead-crm", "access"] as const;

const NO_ACCESS: LeadCrmAccess = {
  is_member: false,
  role: null,
  is_platform_admin: false,
};

export function useLeadCrmAccess() {
  const { user } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: LEAD_CRM_ACCESS_KEY,
    queryFn: myLeadCrmAccess,
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const access = data ?? NO_ACCESS;

  return {
    access,
    isMember: Boolean(access.is_member),
    role: access.role,
    isPlatformAdmin: Boolean(access.is_platform_admin),
    // "loading" is true until we have a definitive answer for a logged-in user;
    // callers should render nothing (not the no-access screen) while loading.
    loading: Boolean(user) && isLoading,
    isError,
    refetch,
  };
}
