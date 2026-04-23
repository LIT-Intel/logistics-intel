/**
 * React hook for server-side entitlement checks
 * Provides a way to check feature access and usage limits
 */

import { useCallback, useState, useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { FeatureKey, UsageLimitKey } from '@/lib/planLimits';

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
  feature_available?: boolean;
  usage_remaining?: number;
  usage_limit?: number | null;
  is_admin?: boolean;
}

export function useEntitlements() {
  const { user, plan, orgRole, orgId } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [cache, setCache] = useState<Map<string, EntitlementCheckResult>>(new Map());

  /**
   * Check if feature is available for current user
   */
  const canAccessFeature = useCallback(
    async (feature: FeatureKey): Promise<EntitlementCheckResult> => {
      if (!user) {
        return { allowed: false, reason: 'Not authenticated' };
      }

      const cacheKey = `feature:${feature}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey)!;
      }

      setIsChecking(true);
      try {
        const { data, error } = await supabase.functions.invoke('check-entitlements', {
          body: {
            user_id: user.id,
            org_id: orgId,
            feature,
          },
        });

        if (error) throw error;

        setCache((prev) => new Map(prev).set(cacheKey, data));
        return data;
      } catch (err) {
        console.error('[useEntitlements] Feature check failed:', err);
        return { allowed: false, reason: 'Failed to check entitlements' };
      } finally {
        setIsChecking(false);
      }
    },
    [user, orgId, cache]
  );

  /**
   * Check if usage is within limit
   */
  const checkUsageLimit = useCallback(
    async (
      limitKey: UsageLimitKey,
      currentUsage: number
    ): Promise<EntitlementCheckResult> => {
      if (!user) {
        return { allowed: false, reason: 'Not authenticated' };
      }

      const cacheKey = `usage:${limitKey}:${currentUsage}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey)!;
      }

      setIsChecking(true);
      try {
        const { data, error } = await supabase.functions.invoke('check-entitlements', {
          body: {
            user_id: user.id,
            org_id: orgId,
            limit_key: limitKey,
            current_usage: currentUsage,
          },
        });

        if (error) throw error;

        setCache((prev) => new Map(prev).set(cacheKey, data));
        return data;
      } catch (err) {
        console.error('[useEntitlements] Usage check failed:', err);
        return { allowed: false, reason: 'Failed to check usage limits' };
      } finally {
        setIsChecking(false);
      }
    },
    [user, orgId, cache]
  );

  /**
   * Invalidate cache (call after user action that affects limits)
   */
  const invalidateCache = useCallback(() => {
    setCache(new Map());
  }, []);

  return {
    canAccessFeature,
    checkUsageLimit,
    invalidateCache,
    isChecking,
    plan,
    isAdmin: ['owner', 'admin'].includes(orgRole || ''),
  };
}
