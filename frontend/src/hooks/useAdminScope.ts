/**
 * useAdminScope — localStorage-backed admin scope toggle.
 *
 * Returns `'org'` (default) or `'all'` for platform_admins who have
 * explicitly opted into cross-org visibility. Per CLAUDE.md, admin bypass
 * is server-side only; this hook controls a UX hint. Defensive guards
 * ignore any 'all' value when the user is not a platform admin so a
 * stale localStorage entry from a demoted user can't widen the view.
 */
import { useCallback, useEffect, useState } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";

export type AdminScope = "org" | "all";

const STORAGE_KEY = "lit.adminScope";

function readStored(): AdminScope {
  if (typeof window === "undefined") return "org";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "all" ? "all" : "org";
}

export function useAdminScope() {
  const { isPlatformAdmin } = useEntitlements();
  const [scope, setScopeState] = useState<AdminScope>(() => readStored());

  // Defensive: a non-admin should never compute scope='all', even if
  // localStorage was left over from a prior admin session.
  const effectiveScope: AdminScope = isPlatformAdmin ? scope : "org";

  // Re-read on admin status change (e.g. role was promoted/demoted mid-session)
  useEffect(() => {
    setScopeState(readStored());
  }, [isPlatformAdmin]);

  const setScope = useCallback(
    (next: AdminScope) => {
      if (!isPlatformAdmin && next === "all") return; // no-op for non-admins
      window.localStorage.setItem(STORAGE_KEY, next);
      setScopeState(next);
    },
    [isPlatformAdmin],
  );

  return { scope: effectiveScope, setScope, isPlatformAdmin };
}
