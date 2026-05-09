import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(undefined);

function normalizePlan(plan) {
  const p = String(plan || '').toLowerCase().trim();

  if (!p || p === 'free' || p === 'free_trial') return 'free_trial';
  if (p === 'starter') return 'starter';
  if (p === 'growth' || p === 'growth_plus') return 'growth';
  if (p.startsWith('enterprise')) return 'enterprise';

  return 'free_trial';
}

function normalizeLegacyRole(role, orgRole, isSuperAdmin) {
  if (isSuperAdmin) return 'super_admin';
  if (orgRole === 'owner' || orgRole === 'admin') return 'admin';
  if (role === 'super_admin' || role === 'admin') return role;
  return 'user';
}

async function fetchProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(
      `
        id,
        email,
        role,
        plan,
        search_limit,
        saved_limit,
        enrichment_limit
      `
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchSubscriptionStatus(userId) {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.status ?? null;
  } catch {
    return null;
  }
}

async function fetchPlatformAdminStatus(userId) {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[components/AuthProvider] platform_admins lookup unavailable:', error.message);
      return false;
    }

    return data !== null;
  } catch (error) {
    console.warn('[components/AuthProvider] platform_admins lookup failed:', error);
    return false;
  }
}

async function fetchPrimaryOrgMembership(userId) {
  if (!userId) {
    return {
      orgId: null,
      orgRole: null,
      membershipStatus: null,
    };
  }

  try {
    const { data, error } = await supabase
      .from('org_members')
      .select(
        `
          org_id,
          role,
          status
        `
      )
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.warn('[components/AuthProvider] org_members lookup failed:', error.message);
      }

      return {
        orgId: null,
        orgRole: null,
        membershipStatus: null,
      };
    }

    return {
      orgId: data.org_id,
      orgRole: data.role,
      membershipStatus: data.status,
    };
  } catch (error) {
    console.warn('[components/AuthProvider] org membership lookup exception:', error);

    return {
      orgId: null,
      orgRole: null,
      membershipStatus: null,
    };
  }
}

function buildUsageFromProfile(profile) {
  if (!profile) return {};

  return {
    searchesUsedThisMonth: 0,
    savedCompaniesUsed: 0,
    enrichmentUsedThisMonth: 0,
    teamUsersUsed: 0,
    profileLimits: {
      search_limit: profile.search_limit ?? null,
      saved_limit: profile.saved_limit ?? null,
      enrichment_limit: profile.enrichment_limit ?? null,
    },
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  const [role, setRole] = useState('user');
  const [plan, setPlan] = useState('free_trial');

  const [orgId, setOrgId] = useState(null);
  const [orgRole, setOrgRole] = useState(null);
  const [membershipStatus, setMembershipStatus] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [subscriptionStatus, setSubscriptionStatus] = useState(null);

  const [authReady, setAuthReady] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [authError, setAuthError] = useState(null);

  const refreshProfile = useCallback(
    async (explicitUserId) => {
      const targetUserId = explicitUserId ?? user?.id;

      if (!targetUserId) {
        setProfile(null);
        setRole('user');
        setPlan('free_trial');
        setOrgId(null);
        setOrgRole(null);
        setMembershipStatus(null);
        setIsSuperAdmin(false);
        return null;
      }

      setLoadingProfile(true);
      setAuthError(null);

      try {
        const [profileData, platformAdmin, membership, subStatus] = await Promise.all([
          fetchProfile(targetUserId),
          fetchPlatformAdminStatus(targetUserId),
          fetchPrimaryOrgMembership(targetUserId),
          fetchSubscriptionStatus(targetUserId),
        ]);

        const resolvedOrgRole = membership?.orgRole || null;
        const resolvedPlan = normalizePlan(profileData?.plan);
        const resolvedRole = normalizeLegacyRole(
          profileData?.role,
          resolvedOrgRole,
          Boolean(platformAdmin)
        );

        setProfile(profileData);
        setRole(resolvedRole);
        setPlan(resolvedPlan);
        setOrgId(membership?.orgId || null);
        setOrgRole(resolvedOrgRole);
        setMembershipStatus(membership?.membershipStatus || null);
        setIsSuperAdmin(Boolean(platformAdmin));
        setSubscriptionStatus(subStatus);

        return profileData;
      } catch (error) {
        console.error('[components/AuthProvider] Failed to load profile/admin context:', error);

        setAuthError(error);
        setProfile(null);
        setRole('user');
        setPlan('free_trial');
        setOrgId(null);
        setOrgRole(null);
        setMembershipStatus(null);
        setIsSuperAdmin(false);
        setSubscriptionStatus(null);

        return null;
      } finally {
        setLoadingProfile(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    let isMounted = true;

    const bootstrapAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        const currentSession = data?.session ?? null;
        const currentUser = currentSession?.user ?? null;

        if (!isMounted) return;

        setSession(currentSession);
        setUser(currentUser);

        if (currentUser?.id) {
          await refreshProfile(currentUser.id);
        } else {
          setProfile(null);
          setRole('user');
          setPlan('free_trial');
          setOrgId(null);
          setOrgRole(null);
          setMembershipStatus(null);
          setIsSuperAdmin(false);
        }
      } catch (error) {
        console.error('[components/AuthProvider] Failed to initialize auth:', error);

        if (!isMounted) return;

        setAuthError(error);
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole('user');
        setPlan('free_trial');
        setOrgId(null);
        setOrgRole(null);
        setMembershipStatus(null);
        setIsSuperAdmin(false);
      } finally {
        if (isMounted) {
          setAuthReady(true);
        }
      }
    };

    bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextUser = nextSession?.user ?? null;

      setSession(nextSession);
      setUser(nextUser);

      if (nextUser?.id) {
        await refreshProfile(nextUser.id);
      } else {
        setProfile(null);
        setRole('user');
        setPlan('free_trial');
        setOrgId(null);
        setOrgRole(null);
        setMembershipStatus(null);
        setIsSuperAdmin(false);
      }

      setAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('[components/AuthProvider] Sign out failed:', error);
      throw error;
    }

    setSession(null);
    setUser(null);
    setProfile(null);
    setRole('user');
    setPlan('free_trial');
    setOrgId(null);
    setOrgRole(null);
    setMembershipStatus(null);
    setIsSuperAdmin(false);
    setSubscriptionStatus(null);
  }, []);

  const usage = useMemo(() => buildUsageFromProfile(profile), [profile]);

  const access = useMemo(() => {
    const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
    const canAccessAdmin = Boolean(isSuperAdmin || isOrgAdmin);

    return {
      isAdmin: canAccessAdmin,
      isSuperAdmin,
      isOrgAdmin,
      canAccessAdmin,
      canUpgrade: !['enterprise'].includes(plan),
      canManageBilling: isSuperAdmin || isOrgAdmin,
      canManageMembers: isSuperAdmin || isOrgAdmin,
      canManageWorkspace: isSuperAdmin || isOrgAdmin,
      plan,
      role,
      orgRole,
      orgId,
      membershipStatus,
      usage,
    };
  }, [isSuperAdmin, orgRole, plan, role, orgId, membershipStatus, usage]);

  const value = useMemo(() => {
    const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
    const canAccessAdmin = Boolean(isSuperAdmin || isOrgAdmin);

    return {
      user,
      session,
      profile,
      role,
      plan,
      access,
      authReady,
      loadingProfile,
      authError,
      refreshProfile,
      setProfile,
      signOut,
      isAuthenticated: Boolean(user),

      isSuperAdmin,
      isOrgAdmin,
      canAccessAdmin,
      orgRole,
      orgId,
      membershipStatus,
      subscriptionStatus,
    };
  }, [
    user,
    session,
    profile,
    role,
    plan,
    access,
    authReady,
    loadingProfile,
    authError,
    refreshProfile,
    signOut,
    isSuperAdmin,
    orgRole,
    orgId,
    membershipStatus,
    subscriptionStatus,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export default AuthProvider;
