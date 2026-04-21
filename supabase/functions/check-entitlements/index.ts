/**
 * Supabase Edge Function: check-entitlements
 *
 * Server-side entitlement validation
 * Validates feature access and usage limits for users/orgs
 *
 * POST /functions/v1/check-entitlements
 * Body: {
 *   user_id: string (optional, defaults to auth.uid())
 *   org_id: string (optional)
 *   feature: string (optional)
 *   limit_key: string (optional)
 *   current_usage: number (optional)
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

interface EntitlementRequest {
  user_id?: string;
  org_id?: string;
  feature?: string;
  limit_key?: string;
  current_usage?: number;
}

interface EntitlementResponse {
  allowed: boolean;
  plan: string;
  reason?: string;
  feature_available?: boolean;
  usage_remaining?: number;
  usage_limit?: number | null;
  org_role?: string;
  is_admin?: boolean;
}

async function checkEntitlements(req: EntitlementRequest): Promise<EntitlementResponse> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get user ID (from request or auth context)
  const userId = req.user_id;
  if (!userId) {
    return { allowed: false, plan: 'unknown', reason: 'No user ID provided' };
  }

  // Get user's subscription
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('plan_code, seats')
    .eq('user_id', userId)
    .maybeSingle();

  if (subError) {
    console.error('[check-entitlements] Subscription lookup failed:', subError);
    return { allowed: false, plan: 'free_trial', reason: 'Unable to check subscription' };
  }

  const planCode = subscription?.plan_code || 'free_trial';

  // Get org context if provided
  let orgRole: string | null = null;
  let isAdmin = false;

  if (req.org_id) {
    const { data: member, error: memberError } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', req.org_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!memberError && member) {
      orgRole = member.role;
      isAdmin = ['owner', 'admin'].includes(member.role);
    }
  }

  // If no specific check requested, return basic info
  if (!req.feature && !req.limit_key) {
    return {
      allowed: true,
      plan: planCode,
      org_role: orgRole || undefined,
      is_admin: isAdmin,
    };
  }

  // Get plan definition
  const { data: plans, error: planError } = await supabase
    .from('plans')
    .select('features, usage_limits, seat_rules')
    .eq('code', planCode)
    .eq('is_active', true)
    .maybeSingle();

  if (planError || !plans) {
    return { allowed: false, plan: planCode, reason: 'Plan not found' };
  }

  // Check feature access
  if (req.feature) {
    const features = plans.features || {};
    const hasFeature = features[req.feature];

    if (!hasFeature && !isAdmin) {
      return {
        allowed: false,
        plan: planCode,
        feature_available: false,
        reason: `Feature "${req.feature}" is not available on this plan`,
      };
    }

    if (!hasFeature) {
      // Admin sees warning but can still access
      return {
        allowed: true,
        plan: planCode,
        feature_available: false,
        reason: `Feature "${req.feature}" not in plan, but allowed via admin override`,
      };
    }
  }

  // Check usage limit
  if (req.limit_key && typeof req.current_usage === 'number') {
    const limits = plans.usage_limits || {};
    const limit = limits[req.limit_key];

    if (limit !== null && req.current_usage >= limit && !isAdmin) {
      const remaining = Math.max(0, limit - req.current_usage);
      return {
        allowed: false,
        plan: planCode,
        usage_remaining: remaining,
        usage_limit: limit,
        reason: `${req.limit_key} limit reached (${req.current_usage}/${limit})`,
      };
    }

    if (limit !== null && req.current_usage >= limit && isAdmin) {
      return {
        allowed: true,
        plan: planCode,
        usage_remaining: 0,
        usage_limit: limit,
        reason: `Usage limit exceeded, allowed via admin override`,
      };
    }

    return {
      allowed: true,
      plan: planCode,
      usage_remaining: limit === null ? null : limit - req.current_usage,
      usage_limit: limit,
    };
  }

  return { allowed: true, plan: planCode };
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json() as EntitlementRequest;
    const result = await checkEntitlements(body);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[check-entitlements] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
