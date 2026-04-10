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

async function fetchPlatformAdminStatus(userId) {
  if (!supabase || !userId) return false;

  try {
    const { data, error } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

async function fetchPrimaryOrgMembership(userId) {
  if (!supabase || !userId) {
    return { orgId: null, orgRole: null, plan: null };
  }

  const sources = [
    { table: 'org_members', userKey: 'user_id', orgKey: 'org_id', roleKey: 'role', statusKey: 'status' },
    { table: 'org_memberships', userKey: 'user_id', orgKey: 'org_id', roleKey: 'role', statusKey: 'status' },
  ];

  for (const source of sources) {
    try {
      let query = supabase
        .from(source.table)
        .select(`${source.orgKey}, ${source.roleKey}, ${source.statusKey}`)
        .eq(source.userKey, userId)
        .limit(10);

      const { data, error } = await query;

      if (error || !Array.isArray(data) || !data.length) continue;

      const active = data.find((row) => {
        const status = row?.[source.statusKey];
        return !status || status === 'active' || status === 'accepted';
      }) || data[0];

      const orgId = active?.[source.orgKey] ?? null;
      const orgRole = active?.[source.roleKey] ?? null;

      let plan = null;
      if (orgId) {
        try {
          const { data: subs } = await supabase
            .from('subscriptions')
            .select('plan_code, status')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (subs?.status === 'active' || subs?.status === 'trialing' || subs?.plan_code) {
            plan = subs?.plan_code || null;
          }
        } catch {
          // ignore subscription lookup failures
        }
      }

      return {
        orgId,
        orgRole,
        plan,
      };
    } catch {
      // try next membership table
    }
  }

  return { orgId: null, orgRole: null, plan: null };
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

        const [isAdmin, membership] = await Promise.all([
          fetchPlatformAdminStatus(u.id),
          fetchPrimaryOrgMembership(u.id),
        ]);

        setIsSuperAdmin(isAdmin);
        setOrgId(membership.orgId);
        setOrgRole(membership.orgRole);
        setPlan(isAdmin ? 'unlimited' : (membership.plan || 'free_trial'));
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
    const elevatedOrgRole = ['owner', 'admin', 'org_admin', 'super_admin'].includes(
      String(orgRole || '').toLowerCase()
    );
    const legacyRole = isSuperAdmin || elevatedOrgRole ? 'admin' : 'user';

    const access = rawUser
      ? {
          isAdmin: isSuperAdmin || legacyRole === 'admin',
          isSuperAdmin,
          canUpgrade: !['unlimited', 'enterprise'].includes(resolvedPlan),
          canManageBilling: isSuperAdmin || elevatedOrgRole,
          canManageOrg: isSuperAdmin || elevatedOrgRole,
          canViewAllPages: isSuperAdmin || elevatedOrgRole,
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
