import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from '@/lib/supabase';
import {
  getAccessState,
  normalizePlan,
  normalizeRole,
} from '@/lib/accessControl';

const AuthContext = createContext(undefined);

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
    .single();

  if (error) {
    throw error;
  }

  return data;
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
  const [authReady, setAuthReady] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [authError, setAuthError] = useState(null);

  const refreshProfile = useCallback(async (explicitUserId) => {
    const targetUserId = explicitUserId ?? user?.id;

    if (!targetUserId) {
      setProfile(null);
      setRole('user');
      setPlan('free_trial');
      return null;
    }

    setLoadingProfile(true);
    setAuthError(null);

    try {
      const profileData = await fetchProfile(targetUserId);

      setProfile(profileData);
      setRole(normalizeRole(profileData?.role));
      setPlan(normalizePlan(profileData?.plan));

      return profileData;
    } catch (error) {
      console.error('[AuthProvider] Failed to load profile:', error);
      setAuthError(error);
      setProfile(null);
      setRole('user');
      setPlan('free_trial');
      return null;
    } finally {
      setLoadingProfile(false);
    }
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    const bootstrapAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

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
        }
      } catch (error) {
        console.error('[AuthProvider] Failed to initialize auth:', error);
        if (!isMounted) return;
        setAuthError(error);
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole('user');
        setPlan('free_trial');
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
      console.error('[AuthProvider] Sign out failed:', error);
      throw error;
    }

    setSession(null);
    setUser(null);
    setProfile(null);
    setRole('user');
    setPlan('free_trial');
  }, []);

  const usage = useMemo(() => buildUsageFromProfile(profile), [profile]);

  const access = useMemo(() => {
    return getAccessState({
      role,
      plan,
      usage,
    });
  }, [role, plan, usage]);

  const value = useMemo(() => {
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
