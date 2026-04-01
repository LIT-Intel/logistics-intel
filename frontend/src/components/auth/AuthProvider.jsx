import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔹 Fetch access control data from DB
  const loadAccess = async (authUser) => {
    if (!authUser) {
      setAccess(null);
      return;
    }

    try {
      // 1. Profile (global role)
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      // 2. Org membership
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("*")
        .eq("user_id", authUser.id)
        .eq("is_active", true)
        .maybeSingle();

      let planCode = "free_trial";
      let organizationId = null;
      let orgRole = null;

      if (membership) {
        organizationId = membership.organization_id;
        orgRole = membership.org_role;

        // 3. Subscription
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("*, plans(code)")
          .eq("organization_id", organizationId)
          .in("status", ["active", "trial"])
          .maybeSingle();

        if (subscription?.plans?.code) {
          planCode = subscription.plans.code;
        }
      }

      setAccess({
        userId: authUser.id,
        email: authUser.email,
        globalRole: profile?.global_role || "customer_user",
        orgRole,
        plan: planCode,
        organizationId,
      });
    } catch (err) {
      console.error("Access load error:", err);
    }
  };

  useEffect(() => {
    // Initial session
    supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data?.session?.user || null;
      setUser(sessionUser);

      if (sessionUser) {
        loadAccess(sessionUser);
      }

      setLoading(false);
    });

    // Auth listener
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const sessionUser = session?.user || null;
        setUser(sessionUser);

        if (sessionUser) {
          await loadAccess(sessionUser);
        } else {
          setAccess(null);
        }

        setLoading(false);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, access, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
