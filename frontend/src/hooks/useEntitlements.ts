/**
 * Server-authoritative entitlement checks.
 *
 * Single source of truth: `get-entitlements` edge fn (JWT-verified, reads
 * auth.uid() from the session). Fetched once per session and cached via
 * TanStack Query. Feature and usage checks derive locally from the cached
 * snapshot — no spoofable per-check round-trips.
 *
 * Security boundary stays server-side: every mutating edge function must
 * re-check entitlements before writing. This hook gates UI affordances only.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { fetchEntitlementsSnapshot } from '@/api/entitlements';
import type { FeatureKey, UsageLimitKey } from '@/lib/planLimits';

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
  feature_available?: boolean;
  usage_remaining?: number | null;
  usage_limit?: number | null;
  is_admin?: boolean;
}

const ENTITLEMENTS_QUERY_KEY = ['entitlements'] as const;

export function useEntitlements() {
  const { user, plan, orgRole } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = ['owner', 'admin'].includes(orgRole || '');

  const {
    data: entitlements,
    isLoading: isChecking,
  } = useQuery({
    queryKey: ENTITLEMENTS_QUERY_KEY,
    queryFn: fetchEntitlementsSnapshot,
    enabled: Boolean(user),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const isPlatformAdmin = Boolean(entitlements?.is_platform_admin);

  const canAccessFeature = useCallback(
    async (feature: FeatureKey): Promise<EntitlementCheckResult> => {
      if (!user) return { allowed: false, reason: 'Not authenticated' };
      if (!entitlements) return { allowed: false, reason: 'Entitlements loading' };

      const hasFeature = Boolean(entitlements.features?.[feature]);
      if (hasFeature) {
        return { allowed: true, feature_available: true, is_admin: isAdmin };
      }
      if (isAdmin) {
        return {
          allowed: true,
          feature_available: false,
          is_admin: true,
          reason: `Feature "${feature}" not in plan, allowed via admin override`,
        };
      }
      return {
        allowed: false,
        feature_available: false,
        is_admin: false,
        reason: `Feature "${feature}" is not available on this plan`,
      };
    },
    [user, entitlements, isAdmin]
  );

  const checkUsageLimit = useCallback(
    async (
      limitKey: UsageLimitKey,
      currentUsage: number
    ): Promise<EntitlementCheckResult> => {
      if (!user) return { allowed: false, reason: 'Not authenticated' };
      if (!entitlements) return { allowed: false, reason: 'Entitlements loading' };

      const limit = entitlements.limits?.[limitKey] ?? null;
      // null limit means unlimited.
      if (limit === null) {
        return { allowed: true, usage_limit: null, usage_remaining: null, is_admin: isAdmin };
      }

      const remaining = Math.max(0, limit - currentUsage);
      const overLimit = currentUsage >= limit;

      if (overLimit && !isAdmin) {
        return {
          allowed: false,
          usage_limit: limit,
          usage_remaining: 0,
          reason: `${limitKey} limit reached (${currentUsage}/${limit})`,
        };
      }
      if (overLimit && isAdmin) {
        return {
          allowed: true,
          usage_limit: limit,
          usage_remaining: 0,
          is_admin: true,
          reason: 'Usage limit exceeded, allowed via admin override',
        };
      }
      return {
        allowed: true,
        usage_limit: limit,
        usage_remaining: remaining,
        is_admin: isAdmin,
      };
    },
    [user, entitlements, isAdmin]
  );

  const invalidateCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_QUERY_KEY });
  }, [queryClient]);

  return {
    canAccessFeature,
    checkUsageLimit,
    invalidateCache,
    isChecking,
    plan,
    isAdmin,
    isPlatformAdmin,
    entitlements,
  };
}
