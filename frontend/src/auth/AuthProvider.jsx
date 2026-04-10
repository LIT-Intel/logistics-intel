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

/**
 * Platform admin is optional.
 * If the table does not exist, we should NOT break auth or admin access.
 * We simply treat platform superadmin as false and rely on org membership.
 */
async function fetchPlatformAdminStatus(userId) {
  if (!supabase || !userId) return false;

  try {
    const { data, error } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      // Table missing or inaccessible: safely fall back to false
      console.warn('[AuthProvider] platform_admins lookup unavailable:', error.message);
      return false;
    }

    return data !== null;
  } catch (error) {
    console.warn('[AuthProvider] platform_admins lookup failed:', error);
    return false;
  }
}

async function fetchPrimaryOrgMembership(userId) {
  if (!supabase || !userId) {
    return { orgId: null, orgRole: null, plan: null };
  }

  try {
    const { data, error } = await supabase
      .from('org_members')
      .select(`
        org_id,
        role,
        status,
        email,
        full_name
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.warn('[AuthProvider] org_members lookup failed:', error.message);
      }
      return { orgId: null, orgRole: null, plan: null };
    }

    // Keep this simple and resilient for now.
    // If you later restore subscriptions join logic, add it back here safely.
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
        const normalized = normalizeUser(u);
        setRawUser(normalized);
        setAuthReady(true);

        const [platformAdmin, membership] = await Promise.all([
          fetchPlatformAdminStatus(u.id),
          fetchPrimaryOrgMembership(u.id),
        ]);

        setIsSuperAdmin(Boolean(platformAdmin));
        setOrgId(membership.orgId);
        setOrgRole(membership.orgRole);
        setPlan(membership.plan || normalized?.user_metadata?.plan || 'free_trial');
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
    const resolvedPlan = plan || rawUser?.user_metadata?.plan || 'free_trial';
    const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
    const canAccessAdmin = Boolean(isSuperAdmin || isOrgAdmin);

    // Backwards compatibility for older parts of the app
    const legacyRole = canAccessAdmin ? 'admin' : 'user';

    const access = rawUser
      ? {
          isAdmin: canAccessAdmin,
          isSuperAdmin,
          isOrgAdmin,
          canAccessAdmin,
          canUpgrade: !['unlimited', 'enterprise'].includes(resolvedPlan),
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
