import React, { useEffect, useMemo, useState } from "react";
import {
  User,
  Shield,
  Database,
  CreditCard,
  Bell,
  Lock,
  Mail,
  Activity,
  Trash2,
  ChevronRight,
  Save,
  RefreshCw,
  AlertCircle,
  Crown,
  Calendar,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { createStripeCheckout, createStripePortalSession } from "@/api/functions";

type ProfileRow = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  title?: string | null;
  timezone?: string | null;
  company_name?: string | null;
  organization_name?: string | null;
};

type OrgRow = {
  id: string;
  name?: string | null;
};

type MembershipRow = {
  org_id?: string | null;
  role?: string | null;
  orgs?: OrgRow | null;
};

type TabId =
  | "account"
  | "security"
  | "integrations"
  | "billing"
  | "notifications"
  | "access";

type SaveState = {
  kind: "idle" | "success" | "error";
  message: string;
};

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || "U").trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function prettyLabel(value?: string | null, fallback = "User") {
  if (!value) return fallback;
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getLocalNameKey(userId?: string) {
  return userId ? `li_settings_full_name_${userId}` : "";
}

function getCanonicalPlan(plan = "free_trial") {
  const p = String(plan || "free_trial").toLowerCase().trim();
  if (p === "free" || p === "free_trial") return "free_trial";
  if (p === "pro" || p === "standard" || p === "starter") return "standard";
  if (p === "growth" || p === "growth_plus") return "growth";
  if (p.startsWith("enterprise")) return "enterprise";
  return p;
}

function getPlanMap() {
  return {
    free_trial: {
      code: "free_trial",
      name: "Free Trial",
      price: "$0",
      max_companies: 10,
      max_emails: 50,
      max_rfps: 5,
      enrichment_enabled: false,
      campaigns_enabled: false,
    },
    standard: {
      code: "standard",
      name: "Standard",
      price: "$49",
      max_companies: 100,
      max_emails: 500,
      max_rfps: 50,
      enrichment_enabled: true,
      campaigns_enabled: false,
    },
    growth: {
      code: "growth",
      name: "Growth",
      price: "$299",
      max_companies: 500,
      max_emails: 2500,
      max_rfps: 200,
      enrichment_enabled: true,
      campaigns_enabled: true,
    },
    enterprise: {
      code: "enterprise",
      name: "Enterprise",
      price: "Custom",
      max_companies: Infinity,
      max_emails: Infinity,
      max_rfps: Infinity,
      enrichment_enabled: true,
      campaigns_enabled: true,
    },
  };
}

function getPlanLimits(plan = "free_trial") {
  const canonical = getCanonicalPlan(plan);
  const planMap = getPlanMap();
  return planMap[canonical as keyof typeof planMap] || planMap.free_trial;
}

function UsageBar({
  label,
  current,
  max,
}: {
  label: string;
  current: number;
  max: number;
}) {
  const safeCurrent = Number(current || 0);
  const isUnlimited = max === Infinity;
  const percentage =
    !isUnlimited && Number(max) > 0
      ? Math.min((safeCurrent / Number(max)) * 100, 100)
      : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span>{label}</span>
        <span className="font-medium">
          {safeCurrent} / {isUnlimited ? "∞" : Number(max).toLocaleString()}
        </span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
        {!isUnlimited && (
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
      {!isUnlimited && percentage >= 90 && (
        <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span>Approaching usage limit</span>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { user, role, plan, access, refreshProfile, fullName: authFullName } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>("account");
  const [isSaving, setIsSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [membershipRole, setMembershipRole] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle", message: "" });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordState, setPasswordState] = useState<SaveState>({
    kind: "idle",
    message: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [billingActionLoading, setBillingActionLoading] = useState(false);

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<any> }> = [
    { id: "account", label: "Account Profile", icon: User },
    { id: "security", label: "Security & Auth", icon: Shield },
    { id: "integrations", label: "Data Sources", icon: Database },
    { id: "billing", label: "Billing & Plan", icon: CreditCard },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "access", label: "Access & Plans", icon: Activity },
  ];

  const loadSettingsData = async (userId?: string) => {
    const targetUserId = userId ?? user?.id;

    if (!targetUserId) {
      setProfile(null);
      setOrg(null);
      setMembershipRole(null);
      setFullName("");
      setWorkEmail("");
      setCompanyName("");
      setOrganizationName("");
      setTimezone("");
      setProfileRole("");
      setLoadingData(false);
      return;
    }

    setLoadingData(true);

    try {
      const localName =
        typeof window !== "undefined"
          ? window.localStorage.getItem(getLocalNameKey(targetUserId)) || ""
          : "";

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role, title, timezone, company_name, organization_name")
        .eq("id", targetUserId)
        .maybeSingle();

      if (profileError) throw profileError;

      const { data: membershipData, error: membershipError } = await supabase
        .from("org_memberships")
        .select("org_id, role, orgs(id, name)")
        .eq("user_id", targetUserId)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;

      const typedProfile = (profileData as ProfileRow | null) ?? null;
      const membership = (membershipData as MembershipRow | null) ?? null;
      const orgData = membership?.orgs ?? null;

      const resolvedOrgName =
        orgData?.name ||
        typedProfile?.organization_name ||
        typedProfile?.company_name ||
        "";

      const resolvedName =
        typedProfile?.full_name ||
        authFullName ||
        localName ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        "";

      const resolvedRole = typedProfile?.role || membership?.role || role || "user";
      const resolvedTimezone =
        typedProfile?.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "";

      setProfile(typedProfile);
      setOrg(orgData);
      setMembershipRole(membership?.role || null);
      setFullName(resolvedName);
      setWorkEmail(user?.email || "");
      setCompanyName(typedProfile?.company_name || "");
      setOrganizationName(resolvedOrgName);
      setTimezone(resolvedTimezone);
      setProfileRole(resolvedRole);
      setSaveState({ kind: "idle", message: "" });
    } catch (error) {
      console.error("[Settings] Failed to load settings data:", error);

      const fallbackName =
        authFullName ||
        (typeof window !== "undefined"
          ? window.localStorage.getItem(getLocalNameKey(targetUserId))
          : "") ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        "";

      setProfile(null);
      setOrg(null);
      setMembershipRole(null);
      setFullName(fallbackName);
      setWorkEmail(user?.email || "");
      setCompanyName("");
      setOrganizationName("");
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
      setProfileRole(role || "user");
      setSaveState({
        kind: "error",
        message: "Could not fully load your settings. Using fallback profile data.",
      });
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    void loadSettingsData();
  }, [user?.id, authFullName]);

  const initials = useMemo(
    () => getInitials(fullName || profile?.full_name, workEmail || user?.email),
    [fullName, profile?.full_name, workEmail, user?.email]
  );

  const profileHeadline = useMemo(() => {
    const primaryTitle = profile?.title?.trim() || "";
    const membershipTitle = prettyLabel(membershipRole, "");
    const authRoleTitle = prettyLabel(profileRole || role, "");

    if (primaryTitle && organizationName) return `${primaryTitle} at ${organizationName}`;
    if (membershipTitle && organizationName) return `${membershipTitle} at ${organizationName}`;
    if (authRoleTitle && organizationName) return `${authRoleTitle} at ${organizationName}`;
    if (organizationName) return organizationName;
    if (primaryTitle) return primaryTitle;
    if (membershipTitle) return membershipTitle;
    if (authRoleTitle) return authRoleTitle;
    return "Manage your Logistics Intel account";
  }, [organizationName, profile?.title, membershipRole, profileRole, role]);

  const displayPlan = useMemo(() => prettyLabel(plan, "Free Trial"), [plan]);
  const isAdmin = Boolean(access?.isAdmin);

  const billingUser = useMemo(() => {
    const customerId =
      (user as any)?.stripe_customer_id ||
      user?.user_metadata?.stripe_customer_id ||
      null;

    const subStatus =
      (user as any)?.subscription_status ||
      user?.user_metadata?.subscription_status ||
      null;

    return {
      ...(user || {}),
      plan,
      stripe_customer_id: customerId,
      subscription_status: subStatus,
      monthly_companies_viewed: access?.usage?.savedCompaniesUsed ?? 0,
      monthly_emails_sent: access?.usage?.enrichmentUsedThisMonth ?? 0,
      monthly_rfps_generated: 0,
    };
  }, [user, plan, access]);

  const canonicalPlan = getCanonicalPlan(
    String((billingUser as any)?.plan || (billingUser as any)?.user_metadata?.plan || "free_trial")
  );
  const planConfig = getPlanLimits(canonicalPlan);
  const upgradePlans = Object.values(getPlanMap()).filter(
    (p) => p.code !== canonicalPlan && p.code !== "free_trial"
  );

  const stripeCustomerId =
    (billingUser as any)?.stripe_customer_id ||
    (billingUser as any)?.user_metadata?.stripe_customer_id ||
    null;

  const subscriptionStatus =
    (billingUser as any)?.subscription_status ||
    (billingUser as any)?.user_metadata?.subscription_status ||
    null;

  const hasActiveSubscription =
    !!stripeCustomerId &&
    ["active", "trialing"].includes(String(subscriptionStatus || "").toLowerCase());

  const handleDiscard = () => {
    const fallbackName =
      profile?.full_name ||
      authFullName ||
      (typeof window !== "undefined"
        ? window.localStorage.getItem(getLocalNameKey(user?.id))
        : "") ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      "";

    setFullName(fallbackName);
    setWorkEmail(user?.email || "");
    setCompanyName(profile?.company_name || "");
    setOrganizationName(
      org?.name || profile?.organization_name || profile?.company_name || ""
    );
    setTimezone(
      profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || ""
    );
    setProfileRole(profile?.role || membershipRole || role || "user");
    setSaveState({ kind: "idle", message: "" });
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    setSaveState({ kind: "idle", message: "" });

    try {
      const normalizedName = fullName.trim();
      const normalizedCompany = companyName.trim();
      const normalizedTimezone = timezone.trim();
      const normalizedRole = (profileRole || "user").trim();
      const localKey = getLocalNameKey(user.id);

      if (typeof window !== "undefined") {
        if (normalizedName) {
          window.localStorage.setItem(localKey, normalizedName);
        } else {
          window.localStorage.removeItem(localKey);
        }
      }

      const { data: savedProfile, error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            full_name: normalizedName || null,
            company_name: normalizedCompany || null,
            timezone: normalizedTimezone || null,
            role: normalizedRole || null,
          },
          { onConflict: "id" }
        )
        .select("id, full_name, role, title, timezone, company_name, organization_name")
        .single();

      if (profileError) throw profileError;

      const typedSavedProfile = (savedProfile as ProfileRow | null) ?? null;

      setProfile(typedSavedProfile);
      setFullName(typedSavedProfile?.full_name || normalizedName || "");
      setCompanyName(typedSavedProfile?.company_name || normalizedCompany || "");
      setTimezone(typedSavedProfile?.timezone || normalizedTimezone || "");
      setProfileRole(typedSavedProfile?.role || normalizedRole);

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: normalizedName || null,
          name: normalizedName || null,
        },
      });

      if (authError) {
        console.warn("[Settings] Auth metadata update warning:", authError);
      }

      if (typeof refreshProfile === "function") {
        await refreshProfile(user.id);
      }

      await loadSettingsData(user.id);

      setSaveState({
        kind: "success",
        message: "Settings saved successfully.",
      });
    } catch (error) {
      console.error("[Settings] Failed to save profile:", error);
      setSaveState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Could not save your settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!newPasswordInput.trim()) {
      setPasswordState({ kind: "error", message: "New password is required." });
      return;
    }

    if (newPasswordInput !== confirmPassword) {
      setPasswordState({ kind: "error", message: "Passwords do not match." });
      return;
    }

    setPasswordLoading(true);
    setPasswordState({ kind: "idle", message: "" });

    try {
      const { error } = await supabase.auth.updateUser({ password: newPasswordInput });
      if (error) throw error;

      setPasswordState({ kind: "success", message: "Password updated successfully." });
      setCurrentPassword("");
      setNewPasswordInput("");
      setConfirmPassword("");
    } catch (error) {
      console.error("[Settings] Password update failed:", error);
      setPasswordState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to update password.",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleUpgrade = async (planCode: string) => {
    setBillingActionLoading(true);
    try {
      const result = await createStripeCheckout({
        plan_code: planCode,
        interval: "month",
      });

      if ((result as any)?.url) {
        window.location.href = (result as any).url;
        return;
      }

      throw new Error("Unable to start checkout.");
    } catch (error) {
      console.error("[Billing] Checkout error:", error);
      alert("Failed to start checkout. Please try again.");
    } finally {
      setBillingActionLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!stripeCustomerId) {
      alert("No Stripe customer found for this account yet.");
      return;
    }

    setBillingActionLoading(true);
    try {
      const result = await createStripePortalSession();

      if ((result as any)?.url) {
        window.location.href = (result as any).url;
        return;
      }

      throw new Error("Unable to create Stripe portal session.");
    } catch (error) {
      console.error("[Billing] Portal error:", error);
      alert("Failed to open billing portal. Please try again.");
    } finally {
      setBillingActionLoading(false);
    }
  };

  return (
    <div className="w-full min-h-full bg-[#F8FAFC] text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto w-full p-8 lg:p-12">
        <div className="mb-8 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-400 mb-2">
              <span>App</span>
              <ChevronRight className="h-4 w-4 text-slate-300" />
              <span className="text-slate-800">Settings</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter">
              Settings
            </h1>
            <p className="text-slate-500 font-medium mt-1">
              Manage your account preferences and enterprise data pipelines.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-black transition-all border ${
                  activeTab === tab.id
                    ? "bg-white text-indigo-600 shadow-sm border-indigo-200 ring-1 ring-indigo-100"
                    : "bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-700 hover:bg-white"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden flex flex-col min-h-[600px]">
          {activeTab === "account" && (
            <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="max-w-3xl space-y-8">
                <div className="flex items-center gap-6 pb-8 border-b border-slate-100">
                  <div className="h-24 w-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-indigo-100 ring-4 ring-white">
                    {initials}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">
                      {loadingData ? "Loading..." : fullName || "Unnamed User"}
                    </h3>
                    <p className="text-sm text-slate-500 font-medium">
                      {loadingData ? "Loading profile..." : profileHeadline}
                    </p>
                    <button className="mt-2 text-xs font-black text-indigo-600 uppercase tracking-widest hover:underline">
                      Change Avatar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                      Full Name
                    </label>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:bg-white outline-none ring-indigo-50 focus:ring-4 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                      Work Email
                    </label>
                    <input
                      value={workEmail}
                      disabled
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-500 outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                      Company Name
                    </label>
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Enter your company name"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:bg-white outline-none ring-indigo-50 focus:ring-4 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                      Timezone
                    </label>
                    <input
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      placeholder="America/New_York"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:bg-white outline-none ring-indigo-50 focus:ring-4 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                      Role
                    </label>
                    <input
                      value={prettyLabel(profileRole, "User")}
                      disabled
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-500 outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                      Organization
                    </label>
                    <input
                      value={organizationName || "No Organization"}
                      disabled
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="max-w-2xl space-y-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Lock className="h-5 w-5 text-indigo-600" /> Password Management
                  </h3>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Current Password"
                        className="md:col-span-2 w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none"
                      />
                      <input
                        type="password"
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        placeholder="New Password"
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none"
                      />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm New"
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none"
                      />
                    </div>
                    <button
                      onClick={handlePasswordUpdate}
                      disabled={passwordLoading}
                      className="bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-60 flex items-center gap-2"
                    >
                      {passwordLoading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <>Update Credentials</>
                      )}
                    </button>
                    {passwordState.kind === "success" && (
                      <div className="text-emerald-600 text-xs font-semibold">
                        {passwordState.message}
                      </div>
                    )}
                    {passwordState.kind === "error" && (
                      <div className="text-red-600 text-xs font-semibold">
                        {passwordState.message}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-indigo-600" /> Multi-Factor Authentication
                  </h3>
                  <div className="flex items-center justify-between p-6 border border-slate-100 bg-emerald-50/30 rounded-2xl">
                    <div className="flex gap-4">
                      <div className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-800">
                          Email Verification Active
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          Secured with {workEmail || user?.email || "your email"}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">
                      Enabled
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "integrations" && (
            <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    title: "ImportYeti API",
                    desc: "Real-time import/export company mapping",
                    active: true,
                    icon: "⚓",
                  },
                  {
                    title: "Gemini Enrichment",
                    desc: "AI-powered company analysis & risk forecasting",
                    active: false,
                    icon: "✨",
                  },
                  {
                    title: "Lusha Contacts",
                    desc: "Direct outreach intelligence for key stakeholders",
                    active: false,
                    icon: "👤",
                  },
                  {
                    title: "Fleet Radar",
                    desc: "Real-time vessel tracking and port congestion",
                    active: true,
                    icon: "🚢",
                  },
                ].map((source, i) => (
                  <div
                    key={i}
                    className={`p-6 rounded-[1.5rem] border transition-all ${
                      source.active
                        ? "border-indigo-100 bg-indigo-50/20 shadow-sm"
                        : "border-slate-100 bg-white opacity-60"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-3xl">{source.icon}</div>
                      <div className="flex items-center h-6 w-12 bg-slate-200 rounded-full p-1 relative cursor-pointer">
                        <div
                          className={`h-4 w-4 rounded-full transition-all duration-300 ${
                            source.active ? "translate-x-6 bg-indigo-600" : "bg-slate-400"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="text-sm font-black text-slate-900">
                      {source.title}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      {source.desc}
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                          source.active
                            ? "bg-indigo-100 text-indigo-600"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {source.active ? "Operational" : "Disabled"}
                      </span>
                      {source.active && (
                        <span className="text-[9px] font-black text-indigo-400 uppercase">
                          Latency: 24ms
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
              <div className="space-y-6">
                <div className="bg-white/90 backdrop-blur-sm shadow-lg border border-slate-200 rounded-3xl p-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
                    <div className="flex items-center gap-2">
                      <Crown className="w-5 h-5 text-blue-600" />
                      <span className="text-lg font-black">Current Plan</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800">
                        {planConfig.name}
                      </span>
                      {subscriptionStatus && (
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-800 capitalize">
                          {subscriptionStatus}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold mb-3">Plan Features</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Companies per month</span>
                          <span className="font-medium">
                            {planConfig.max_companies === Infinity
                              ? "Unlimited"
                              : Number(planConfig.max_companies).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Emails per month</span>
                          <span className="font-medium">
                            {planConfig.max_emails === Infinity
                              ? "Unlimited"
                              : Number(planConfig.max_emails).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>RFPs per month</span>
                          <span className="font-medium">
                            {planConfig.max_rfps === Infinity
                              ? "Unlimited"
                              : Number(planConfig.max_rfps).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Data enrichment</span>
                          <span className="font-medium">
                            {planConfig.enrichment_enabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Campaign automation</span>
                          <span className="font-medium">
                            {planConfig.campaigns_enabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-3">Billing Information</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Plan price</span>
                          <span className="font-medium">{planConfig.price}/month</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Subscription state</span>
                          <span className="font-medium capitalize">
                            {subscriptionStatus || "Not subscribed"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stripe customer</span>
                          <span className="font-medium">
                            {stripeCustomerId ? "Connected" : "Not connected"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Next billing date</span>
                          <span className="font-medium">
                            {hasActiveSubscription ? "Expected via Stripe" : "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 mt-6">
                    {hasActiveSubscription ? (
                      <button
                        onClick={handleManageSubscription}
                        disabled={billingActionLoading}
                        className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-60"
                      >
                        {billingActionLoading ? "Opening..." : "Manage Subscription"}
                      </button>
                    ) : (
                      upgradePlans.map((upgrade) => (
                        <button
                          key={upgrade.code}
                          onClick={() => handleUpgrade(upgrade.code)}
                          disabled={billingActionLoading}
                          className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-60"
                        >
                          {billingActionLoading
                            ? "Processing..."
                            : `Upgrade to ${upgrade.name}`}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm shadow-lg border border-slate-200 rounded-3xl p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    <span className="text-lg font-black">Usage This Month</span>
                  </div>

                  <div className="space-y-5">
                    <UsageBar
                      label="Companies Viewed"
                      current={Number((billingUser as any)?.monthly_companies_viewed || 0)}
                      max={planConfig.max_companies}
                    />
                    <UsageBar
                      label="Emails Sent"
                      current={Number((billingUser as any)?.monthly_emails_sent || 0)}
                      max={planConfig.max_emails}
                    />
                    <UsageBar
                      label="RFPs Generated"
                      current={Number((billingUser as any)?.monthly_rfps_generated || 0)}
                      max={planConfig.max_rfps}
                    />
                  </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm shadow-lg border border-slate-200 rounded-3xl p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <span className="text-lg font-black">Billing History</span>
                  </div>

                  {hasActiveSubscription ? (
                    <div className="space-y-3">
                      {[0, 1].map((offset) => {
                        const date = new Date();
                        date.setMonth(date.getMonth() - offset);

                        return (
                          <div
                            key={offset}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div>
                              <div className="font-medium">
                                {date.toLocaleString("en-US", {
                                  month: "long",
                                  year: "numeric",
                                })}
                              </div>
                              <div className="text-sm text-gray-600">{planConfig.name} Plan</div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-green-100 text-green-800">
                                Paid
                              </span>
                              <span className="font-medium">{planConfig.price}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">
                      No billing history yet for this account.
                    </div>
                  )}
                </div>

                <div className="bg-white/90 backdrop-blur-sm shadow-lg border border-slate-200 rounded-3xl p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                    <span className="text-lg font-black">Payment Method</span>
                  </div>

                  {hasActiveSubscription ? (
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded flex items-center justify-center">
                          <CreditCard className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium">Managed in Stripe</div>
                          <div className="text-sm text-gray-600">
                            Update card details from the billing portal
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleManageSubscription}
                        disabled={billingActionLoading}
                        className="border border-slate-300 px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-60"
                      >
                        {billingActionLoading ? "Opening..." : "Update"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-slate-400" />
                      Add a payment method during checkout when you upgrade.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    defaultChecked
                  />
                  <span className="text-sm font-medium">Email updates</span>
                </label>
              </div>
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-sm font-medium">Push notifications</span>
                </label>
              </div>
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    defaultChecked
                  />
                  <span className="text-sm font-medium">Weekly reports</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === "access" && (
            <div className="flex-1 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
              <h3 className="text-lg font-black text-slate-900">Access & Plans</h3>
              <p className="text-sm text-slate-600 max-w-xl">
                Configure beta access, seat assignments and free plan limits. Upgrade plans to
                unlock higher limits and advanced features.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Current Role
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-900">
                      {prettyLabel(profileRole || role, "User")}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Current Plan
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-900">
                      {displayPlan}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Search Access
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-900">
                      {access?.features?.search ? "Enabled" : "Disabled"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Admin Access
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-900">
                      {isAdmin ? "Admin" : "Standard User"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">Beta Invitees</h4>
                    <p className="text-xs text-slate-500">
                      Users invited to the beta will appear here.
                    </p>
                  </div>
                  <button className="text-xs font-black text-indigo-600 uppercase hover:underline">
                    Invite User
                  </button>
                </div>

                <ul className="space-y-2">
                  <li className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black">
                        JD
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">
                          janedoe@beta.com
                        </div>
                        <div className="text-xs text-slate-500">Pending activation</div>
                      </div>
                    </div>
                    <span className="text-[9px] font-black uppercase bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full">
                      Invite Sent
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          <div className="mt-auto border-t border-slate-100 p-6 bg-slate-50/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-2 text-slate-400">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <div className="text-xs font-medium italic">
                {saveState.kind === "success" && (
                  <span className="text-emerald-600 not-italic">{saveState.message}</span>
                )}
                {saveState.kind === "error" && (
                  <span className="text-red-600 not-italic">{saveState.message}</span>
                )}
                {saveState.kind === "idle" && "Unsaved changes will be lost."}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                className="text-xs font-black uppercase text-slate-400 tracking-widest hover:text-slate-600"
                onClick={handleDiscard}
                type="button"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !user}
                type="button"
                className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2 min-w-[160px] justify-center disabled:opacity-60"
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <div className="flex-1 bg-white p-6 border border-slate-200 rounded-3xl flex items-center gap-4">
            <div className="h-12 w-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-black text-slate-900">Debug Agent</div>
              <p className="text-xs text-slate-500 font-medium">
                Verify data pipeline health and logs.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300 ml-auto" />
          </div>

          <div className="flex-1 bg-white p-6 border border-slate-200 rounded-3xl flex items-center gap-4">
            <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-black text-red-600">Delete Account</div>
              <p className="text-xs text-slate-500 font-medium">
                Permanently wipe enterprise data.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300 ml-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
