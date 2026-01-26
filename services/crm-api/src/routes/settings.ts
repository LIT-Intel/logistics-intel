import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const UpdateProfileSchema = z.object({
  full_name: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  email_signature_html: z.string().optional(),
});

const UpdateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().optional(),
  region: z.string().optional(),
  timezone: z.string().optional(),
});

const UpdateOrgSettingsSchema = z.object({
  search_depth: z.enum(['light', 'full']).optional(),
  max_results: z.number().int().positive().optional(),
  auto_enrichment: z.boolean().optional(),
  cache_enabled: z.boolean().optional(),
  credit_protection: z.boolean().optional(),
  mfa_required: z.boolean().optional(),
  magic_link_enabled: z.boolean().optional(),
  google_oauth_enabled: z.boolean().optional(),
  command_center_defaults: z.record(z.any()).optional(),
  rfp_defaults: z.record(z.any()).optional(),
});

const InviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']),
});

function getAuthUserId(req: any): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.split(' ')[1];
  if (!token) return null;
  return token;
}

// Get current user profile
r.get('/settings/profile', limiter, async (req, res, next) => {
  try {
    const authToken = getAuthUserId(req);
    if (!authToken) return res.status(401).json({ error: 'unauthorized' });

    const { data: user, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !user?.user?.id) return res.status(401).json({ error: 'unauthorized' });

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    res.json({ profile: profile || { id: user.user.id, email: user.user.email } });
  } catch (err) {
    next(err);
  }
});

// Update current user profile
r.put('/settings/profile', limiter, async (req, res, next) => {
  try {
    const authToken = getAuthUserId(req);
    if (!authToken) return res.status(401).json({ error: 'unauthorized' });

    const body = UpdateProfileSchema.parse(req.body);

    const { data: user, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !user?.user?.id) return res.status(401).json({ error: 'unauthorized' });

    const { data: profile, error } = await supabase
      .from('users')
      .update(body)
      .eq('id', user.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

// Get organization
r.get('/settings/organization', limiter, async (req, res, next) => {
  try {
    const authToken = getAuthUserId(req);
    if (!authToken) return res.status(401).json({ error: 'unauthorized' });

    const { data: user, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !user?.user?.id) return res.status(401).json({ error: 'unauthorized' });

    // Get user's org via org_members
    const { data: membership, error: memberError } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.user.id)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!membership) return res.status(404).json({ error: 'no_organization' });

    // Get org and settings
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', membership.org_id)
      .single();

    if (orgError) throw orgError;

    const { data: settings, error: settingsError } = await supabase
      .from('org_settings')
      .select('*')
      .eq('org_id', membership.org_id)
      .maybeSingle();

    if (settingsError) throw settingsError;

    res.json({ org, settings, role: membership.role });
  } catch (err) {
    next(err);
  }
});

// Update organization
r.put('/settings/organization', limiter, async (req, res, next) => {
  try {
    const authToken = getAuthUserId(req);
    if (!authToken) return res.status(401).json({ error: 'unauthorized' });

    const body = UpdateOrgSchema.parse(req.body);

    const { data: user, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !user?.user?.id) return res.status(401).json({ error: 'unauthorized' });

    // Check if admin
    const { data: membership, error: memberError } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.user.id)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'insufficient_permissions' });
    }

    const { data: org, error } = await supabase
      .from('organizations')
      .update(body)
      .eq('id', membership.org_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ org });
  } catch (err) {
    next(err);
  }
});

// Get org settings
r.get('/settings/org-settings', limiter, async (req, res, next) => {
  try {
    const authToken = getAuthUserId(req);
    if (!authToken) return res.status(401).json({ error: 'unauthorized' });

    const { data: user, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !user?.user?.id) return res.status(401).json({ error: 'unauthorized' });

    const { data: membership, error: memberError } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.user.id)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!membership) return res.status(404).json({ error: 'no_organization' });

    const { data: settings, error: settingsError } = await supabase
      .from('org_settings')
      .select('*')
      .eq('org_id', membership.org_id)
      .maybeSingle();

    if (settingsError) throw settingsError;

    res.json({ settings: settings || {} });
  } catch (err) {
    next(err);
  }
});

// Update org settings
r.put('/settings/org-settings', limiter, async (req, res, next) => {
  try {
    const authToken = getAuthUserId(req);
    if (!authToken) return res.status(401).json({ error: 'unauthorized' });

    const body = UpdateOrgSettingsSchema.parse(req.body);

    const { data: user, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !user?.user?.id) return res.status(401).json({ error: 'unauthorized' });

    // Check if admin
    const { data: membership, error: memberError } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.user.id)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'insufficient_permissions' });
    }

    // Upsert org_settings
    const { data: settings, error } = await supabase
      .from('org_settings')
      .upsert(
        { org_id: membership.org_id, ...body, updated_at: new Date().toISOString() },
        { onConflict: 'org_id' }
      )
      .select()
      .single();

    if (error) throw error;

    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

// List team members
r.get('/settings/team/members', limiter, async (req, res, next) => {
  try {
    const authToken = getAuthUserId(req);
    if (!authToken) return res.status(401).json({ error: 'unauthorized' });

    const { data: user, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !user?.user?.id) return res.status(401).json({ error: 'unauthorized' });

    const { data: membership, error: memberError } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.user.id)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!membership) return res.status(404).json({ error: 'no_organization' });

    // Get all members
    const { data: members, error } = await supabase
      .from('org_members')
      .select('id, user_id, role, joined_at')
      .eq('org_id', membership.org_id)
      .order('joined_at', { ascending: false });

    if (error) throw error;

    // Enrich with user info
    const enriched = await Promise.all(
      members.map(async (m) => {
        const { data: userData } = await supabase
          .from('users')
          .select('id, email, full_name')
          .eq('id', m.user_id)
          .maybeSingle();

        return {
          ...m,
          user: userData,
        };
      })
    );

    res.json({ members: enriched });
  } catch (err) {
    next(err);
  }
});

// Update member role
r.put('/settings/team/members/:member_id/role', limiter, async (req, res, next) => {
  try {
    const authToken = getAuthUserId(req);
    if (!authToken) return res.status(401).json({ error: 'unauthorized' });

    const body = z.object({ role: z.enum(['admin', 'member', 'viewer']) }).parse(req.body);

    const { data: user, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !user?.user?.id) return res.status(401).json({ error: 'unauthorized' });

    // Check if admin
    const { data: membership, error: memberError } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.user.id)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'insufficient_permissions' });
    }

    const { data: member, error } = await supabase
      .from('org_members')
      .update({ role: body.role })
      .eq('id', req.params.member_id)
      .eq('org_id', membership.org_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ member });
  } catch (err) {
    next(err);
  }
});

// List pending invites
r.get('/settings/team/invites', limiter, async (req, res, next) => {
  try {
    const authToken = getAuthUserId(req);
    if (!authToken) return res.status(401).json({ error: 'unauthorized' });

    const { data: user, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !user?.user?.id) return res.status(401).json({ error: 'unauthorized' });

    const { data: membership, error: memberError } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.user.id)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'insufficient_permissions' });
    }

    const { data: invites, error } = await supabase
      .from('org_invites')
      .select('*')
      .eq('org_id', membership.org_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ invites });
  } catch (err) {
    next(err);
  }
});

// Get billing info
r.get('/settings/billing', limiter, async (req, res, next) => {
  try {
    const authToken = getAuthUserId(req);
    if (!authToken) return res.status(401).json({ error: 'unauthorized' });

    const { data: user, error: userError } = await supabase.auth.getUser(authToken);
    if (userError || !user?.user?.id) return res.status(401).json({ error: 'unauthorized' });

    const { data: membership, error: memberError } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.user.id)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'insufficient_permissions' });
    }

    const { data: billing, error: billingError } = await supabase
      .from('org_billing')
      .select('*')
      .eq('org_id', membership.org_id)
      .maybeSingle();

    if (billingError) throw billingError;

    // Get seat count
    const { data: members, error: membersError } = await supabase
      .from('org_members')
      .select('id')
      .eq('org_id', membership.org_id);

    if (membersError) throw membersError;

    // Get token usage for current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: tokenUsage, error: tokenError } = await supabase
      .from('token_ledger')
      .select('tokens')
      .eq('org_id', membership.org_id)
      .gte('created_at', monthStart.toISOString());

    if (tokenError) throw tokenError;

    const totalTokensUsed = tokenUsage.reduce((sum, row) => sum + row.tokens, 0);

    res.json({
      billing: billing || { plan: 'free', token_limit_monthly: 100000, seat_limit: 5 },
      seats: { used: members?.length || 0, limit: billing?.seat_limit || 5 },
      tokens: {
        used: totalTokensUsed,
        limit: billing?.token_limit_monthly || 100000,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default r;
