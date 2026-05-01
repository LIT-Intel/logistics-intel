import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  signInWithGoogle,
  signInWithMicrosoft,
  signInWithEmailPassword,
  registerWithEmailPassword,
  listenToAuth,
  logout as logoutClient,
  supabase,
} from './supabaseAuthClient';

const SUPER_ADMIN_EMAILS = new Set([
  'vraymond@sparkfusiondigital.com',
  'vraymond83@gmail.com',
  'support@logisticintel.com',
]);

const AuthCtx = createContext({
  user: null,
  loading: true,
  authReady: false,
  fullName: null,
  role: null,
  plan: null,
  access: null,
  isSuperAdmin: false,
  isOrgAdmin: false,
  canAccessAdmin: false,
  orgRole: null,
  orgId: null,
  signInWithGoogle: async () => {},
  signInWithMicrosoft: async () => {},
  signInWithEmailPassword: async () => {},
  registerWithEmailPassword: async () => {},
  logout: async () => {},
});

function getDisplayName(u) {
  if (!u) return '';

  const meta = u.user_metadata || {};
  const joinedName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim();

  return (
    meta.full_name ||
    meta.display_name ||
    meta.name ||
    joinedName ||
    (u.email?.split('@')[0] ?? '')
  );
}

function normalizePlan(rawPlan) {
  const value = String(rawPlan || '').trim().toLowerCase();

  if (!value) return 'free_trial';
  if (value === 'free') return 'free_trial';
  if (value === 'standard') return 'starter';
  if (value === 'pro') return 'growth';
  if (value === 'unlimited') return 'enterprise';

  if (['free_trial', 'starter', 'growth', 'enterprise'].includes(value)) {
    return value;
  }

  return 'free_trial';
}

function normalizeUser(u) {
  if (!u) return null;

  const meta = u.user_metadata || {};

  return {
    ...u,
    stripe_customer_id: meta.stripe_customer_id || null,
    subscription_status: meta.subscription_status || null,
    displayName: getDisplayName(u),
  };
}

async function fetchPrimaryOrgMembership(userId) {
  if (!supabase || !userId) {
    return { orgId: null, orgRole: null, plan: null };
  }

  try {
    // Note: org_members has no status column — filter by user_id only
    const { data, error } = await supabase
      .from('org_members')
      .select('org_id, role, email, full_name')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.warn('[AuthProvider] org_members lookup failed:', error.message);
      }
      return { orgId: null, orgRole: null, plan: null };
    }

    return {
      orgId: data.org_id,
      orgRole: data.role,
      plan: null,
    };
  } catch (error) {
    console.warn('[AuthProvider] org membership lookup exception:', error);
    return { orgId: null, orgRole: null, plan: null };
  }
}

export function AuthProvider({ children }) {
  const [rawUser, setRawUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [orgRole, setOrgRole] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    const unsub = listenToAuth(async (u) => {
      if (u) {
        // getUser() fetches server-fresh metadata (JWT may lag after signUp metadata writes)
        const freshData = supabase ? await supabase.auth.getUser().catch(() => null) : null;
        const freshUser = freshData?.data?.user;
        const merged = freshUser ? { ...u, user_metadata: { ...u.user_metadata, ...freshUser.user_metadata }, created_at: freshUser.created_at || u.created_at } : u;

        const normalized = normalizeUser(merged);
        const email = String(normalized?.email || '').trim().toLowerCase();
        const superAdminByEmail = SUPER_ADMIN_EMAILS.has(email);

        setRawUser(normalized);
        setAuthReady(true);

        const membership = await fetchPrimaryOrgMembership(u.id);

        setIsSuperAdmin(superAdminByEmail);
        setOrgId(membership.orgId);
        setOrgRole(membership.orgRole);

        const resolvedPlan = normalizePlan(
          membership.plan || normalized?.user_metadata?.plan || 'free_trial'
        );
        setPlan(resolvedPlan);
      } else {
        setRawUser(null);
        setAuthReady(false);
        setIsSuperAdmin(false);
        setOrgId(null);
        setOrgRole(null);
        setPlan(null);
      }

      setLoading(false);
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const handleLogout = async () => {
    try {
      setLoading(true);
      setRawUser(null);
      setAuthReady(false);
      setIsSuperAdmin(false);
      setOrgId(null);
      setOrgRole(null);
      setPlan(null);

      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('litName');
          localStorage.removeItem('supabase.auth.token');
        }
      } catch {
        // ignore storage cleanup issues
      }

      await logoutClient();
    } finally {
      setLoading(false);
    }
  };

  const value = useMemo(() => {
    const resolvedPlan = normalizePlan(plan || rawUser?.user_metadata?.plan || 'free_trial');
    const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
    // Platform admin (Admin Dashboard, CMS, Debug Agent) = superadmin only.
    // isOrgAdmin means "owns/admins a workspace" — does NOT grant platform admin pages.
    const canAccessAdmin = Boolean(isSuperAdmin);

    const legacyRole = canAccessAdmin ? 'admin' : 'user';

    const access = rawUser
      ? {
          isAdmin: canAccessAdmin,
          isSuperAdmin,
          isOrgAdmin,
          canAccessAdmin,
          canUpgrade: !['enterprise'].includes(resolvedPlan),
          canManageBilling: isSuperAdmin || orgRole === 'owner' || orgRole === 'admin',
          canManageMembers: isSuperAdmin || orgRole === 'owner' || orgRole === 'admin',
          canManageWorkspace: isSuperAdmin || orgRole === 'owner' || orgRole === 'admin',
          plan: resolvedPlan,
          role: legacyRole,
          orgRole,
          orgId,
        }
      : null;

    return {
      user: rawUser,
      loading,
      authReady,
      role: legacyRole,
      plan: resolvedPlan,
      access,
      isSuperAdmin,
      isOrgAdmin,
      canAccessAdmin,
      orgRole,
      orgId,
      signInWithGoogle,
      signInWithMicrosoft,
      signInWithEmailPassword,
      registerWithEmailPassword,
      logout: handleLogout,
      fullName: rawUser?.displayName || null,
    };
  }, [rawUser, loading, authReady, isSuperAdmin, orgRole, orgId, plan]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
