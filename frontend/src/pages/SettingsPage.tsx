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
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { createStripeCheckout, createStripePortalSession } from "@/api/functions";

type ProfileRow = {
  id: string;
  full_name?: string | null;
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
        <span className="text-slate-700">{label}</span>
        <span className="font-medium text-slate-900">
          {safeCurrent} / {isUnlimited ? "∞" : Number(max).toLocaleString()}
        </span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
        {!isUnlimited && (
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
      {!isUnlimited && percentage >= 90 && (
        <div className="flex items-center gap-2 mt-2 text-sm text-amber-600">
          <AlertCircle className="w-4 h-4" />
          <span>Approaching usage limit</span>
        </div>
      )}
    </div>
  );
}

const ToggleSwitch = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      checked ? "bg-blue-600" : "bg-slate-300"
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? "translate-x-6" : "translate-x-1"
      }`}
    />
  </button>
);

export default function SettingsPage() {
  const { user } = useAuth();
  const plan = user?.plan || "free_trial";
  const role = user?.role || "user";

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

  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteLoading, setInviteLoading] = useState(false);

  const [notifications, setNotifications] = useState<Record<string, boolean>>({
    weekly_digest: true,
    campaign_alerts: true,
    rfp_updates: false,
    enrichment_completion: true,
    new_company_alerts: true,
    usage_warnings: true,
    team_activity: false,
    invoice_receipts: true,
    subscription_alerts: true,
  });

  const [billingData, setBillingData] = useState<any>({
    current_plan: null,
    next_billing_date: null,
    stripe_status: null,
    usage: {
      companies_viewed: 0,
      emails_sent: 0,
      rfps_generated: 0,
    },
    billing_history: [],
  });

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<any> }> = [
    { id: "account", label: "Account", icon: User },
    { id: "security", label: "Security", icon: Shield },
    { id: "integrations", label: "Data Sources", icon: Database },
    { id: "billing", label: "Billing & plan", icon: CreditCard },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "access", label: "Access", icon: Activity },
  ];

  const loadSettingsData = async (userId?: string) => {
    const targetUserId = userId ?? user?.id;
    if (!targetUserId) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    try {
      const { data: profileData } = await supabase
        .from("user_profiles")
        .select("id, full_name, company_name, organization_name")
        .eq("id", targetUserId)
        .maybeSingle();

      const { data: membershipData } = await supabase
        .from("org_members")
        .select("org_id, role, organizations(id, name)")
        .eq("user_id", targetUserId)
        .limit(1)
        .maybeSingle();

      const typedProfile = (profileData as ProfileRow | null) ?? null;
      const membership = (membershipData as any) ?? null;
      const orgData = membership?.organizations ?? null;

      setProfile(typedProfile);
      setOrg(orgData);
      setMembershipRole(membership?.role || null);
      setFullName(typedProfile?.full_name || user?.user_metadata?.full_name || "");
      setWorkEmail(user?.email || "");
      setCompanyName(typedProfile?.company_name || "");
      setOrganizationName(
        orgData?.name || typedProfile?.organization_name || typedProfile?.company_name || ""
      );
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
      setSaveState({ kind: "idle", message: "" });
    } catch (error) {
      console.error("[Settings] Failed to load settings data:", error);
      setSaveState({
        kind: "error",
        message: "Could not fully load your settings.",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const loadOrgMembers = async (userId?: string) => {
    const targetUserId = userId ?? user?.id;
    if (!targetUserId) {
      setOrgMembers([]);
      return;
    }

    try {
      const { data: membershipData } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", targetUserId)
        .limit(1)
        .maybeSingle();

      if (membershipData?.org_id) {
        const { data: members } = await supabase
          .from("org_members")
          .select("id, user_id, role, created_at, users(id, email)")
          .eq("org_id", membershipData.org_id)
          .order("created_at", { ascending: false });

        setOrgMembers(members || []);

        const { data: invites } = await supabase
          .from("org_invites")
          .select("id, email, role, status, created_at")
          .eq("org_id", membershipData.org_id)
          .order("created_at", { ascending: false });

        if (invites && invites.length > 0) {
          const inviteMembers = invites.map((inv) => ({
            id: inv.id,
            email: inv.email,
            role: inv.role,
            status: "invited",
            created_at: inv.created_at,
          }));
          setOrgMembers((prev) => [...inviteMembers, ...prev]);
        }
      }
    } catch (error) {
      console.error("[Settings] Failed to load org members:", error);
    }
  };

  const loadBillingData = async (userId?: string) => {
    const targetUserId = userId ?? user?.id;
    if (!targetUserId) {
      return;
    }

    try {
      // Load subscription data
      const { data: subscriptionData } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();

      // Load token usage data
      const { data: tokenData } = await supabase
        .from("token_ledger")
        .select("feature, tokens, created_at")
        .eq("user_id", targetUserId)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      // Calculate usage by feature
      const usage = {
        companies_viewed: 0,
        emails_sent: 0,
        rfps_generated: 0,
      };

      if (tokenData) {
        tokenData.forEach((entry: any) => {
          if (entry.feature === "company_modal") usage.companies_viewed += entry.tokens;
          if (entry.feature === "search") usage.emails_sent += entry.tokens;
          if (entry.feature === "rfp") usage.rfps_generated += entry.tokens;
        });
      }

      // Calculate next billing date
      const nextBillingDate = subscriptionData?.current_period_end
        ? new Date(subscriptionData.current_period_end)
        : null;

      setBillingData({
        current_plan: subscriptionData?.plan_code || null,
        next_billing_date: nextBillingDate,
        stripe_status: subscriptionData?.status || null,
        stripe_customer_id: subscriptionData?.stripe_customer_id || null,
        usage,
        billing_history: [], // TODO: fetch from Stripe API if needed
      });
    } catch (error) {
      console.error("[Settings] Failed to load billing data:", error);
    }
  };

  const handleSendInvite = async () => {
    if (!user?.id || !inviteEmail.trim()) return;

    setInviteLoading(true);
    try {
      const { data: membershipData } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!membershipData?.org_id) {
        throw new Error("No organization found");
      }

      const { error } = await supabase.from("org_invites").insert({
        org_id: membershipData.org_id,
        email: inviteEmail.trim(),
        role: inviteRole,
        invited_by: user.id,
        status: "pending",
      });

      if (error) throw error;

      setInviteEmail("");
      setInviteRole("member");
      setShowInviteModal(false);
      await loadOrgMembers(user.id);
      setSaveState({
        kind: "success",
        message: "Invite sent successfully!",
      });
    } catch (error) {
      console.error("[Settings] Invite failed:", error);
      setSaveState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to send invite.",
      });
    } finally {
      setInviteLoading(false);
    }
  };

  useEffect(() => {
    void loadSettingsData();
    void loadOrgMembers();
    void loadBillingData();
  }, [user?.id]);

  const initials = useMemo(
    () => getInitials(fullName, workEmail),
    [fullName, workEmail]
  );

  const displayPlan = useMemo(() => prettyLabel(plan, "Free Trial"), [plan]);
  const isAdmin = Boolean(role === "admin" || role === "owner");

  const canonicalPlan = getCanonicalPlan(String(plan || "free_trial"));
  const planConfig = getPlanLimits(canonicalPlan);
  const upgradePlans = Object.values(getPlanMap()).filter(
    (p) => p.code !== canonicalPlan && p.code !== "free_trial"
  );

  const handleDiscard = () => {
    setFullName(profile?.full_name || "");
    setCompanyName(profile?.company_name || "");
    setOrganizationName(org?.name || profile?.organization_name || "");
    setSaveState({ kind: "idle", message: "" });
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    setSaveState({ kind: "idle", message: "" });

    try {
      const normalizedName = fullName.trim();
      const normalizedCompany = companyName.trim();

      const { error: profileError } = await supabase
        .from("user_profiles")
        .upsert(
          {
            user_id: user.id,
            full_name: normalizedName || null,
          },
          { onConflict: "user_id" }
        );

      if (profileError) throw profileError;

      setSaveState({
        kind: "success",
        message: "Settings saved successfully.",
      });
    } catch (error) {
      console.error("[Settings] Failed to save profile:", error);
      setSaveState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save your settings.",
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
        message: error instanceof Error ? error.message : "Failed to update password.",
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
      setSaveState({
        kind: "error",
        message: "Failed to start checkout. Please try again.",
      });
    } finally {
      setBillingActionLoading(false);
    }
  };

  const handleManageSubscription = async () => {
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
      setSaveState({
        kind: "error",
        message: "Failed to open billing portal. Please try again.",
      });
    } finally {
      setBillingActionLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Workspace › Settings</div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 truncate">Settings</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1 line-clamp-2">
                Manage your account, security, billing, and integrations
              </p>
            </div>
            <div className="flex flex-col xs:flex-row gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={handleDiscard}
                className="px-3 sm:px-6 py-2 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 transition-colors text-slate-900 font-medium text-sm sm:text-base whitespace-nowrap"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !user}
                className="px-3 sm:px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium text-sm sm:text-base whitespace-nowrap"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs - Desktop */}
      <div className="hidden sm:block border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-4 lg:gap-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-2 lg:px-1 border-b-2 transition-colors flex items-center gap-2 text-sm lg:text-base whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <tab.icon className="w-4 h-4 flex-shrink-0" />
                <span className="sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs - Mobile Dropdown */}
      <div className="sm:hidden border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as TabId)}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-slate-900 text-sm focus:border-blue-500 focus:outline-none transition-colors"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {activeTab === "account" && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-6 sm:mb-8 gap-4">
                <div className="flex items-start gap-3 sm:gap-6 min-w-0">
                  <div className="w-16 h-16 sm:w-24 sm:h-24 bg-blue-600 rounded-2xl flex items-center justify-center text-xl sm:text-3xl font-bold text-white flex-shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg sm:text-2xl font-bold text-slate-900 truncate">
                      {loadingData ? "Loading..." : fullName || "Unnamed User"}
                    </h2>
                    <p className="text-sm sm:text-base text-gray-600 mt-1 truncate">
                      {membershipRole ? prettyLabel(membershipRole) : "User"}
                      {organizationName ? ` at ${organizationName}` : ""}
                    </p>
                    <button className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm mt-2 font-medium">
                      Change avatar
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <span className="px-2 sm:px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-200 whitespace-nowrap">
                    {prettyLabel(plan, "Free Trial")}
                  </span>
                  <span className="px-2 sm:px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold border border-green-200 whitespace-nowrap">
                    Active
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 sm:mb-3 block font-semibold">
                    Full Name
                  </label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 sm:mb-3 block font-semibold">
                    Work Email
                  </label>
                  <input
                    value={workEmail}
                    disabled
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-gray-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 sm:mb-3 block font-semibold">
                    Company Name
                  </label>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                    placeholder="Acme Inc."
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 sm:mb-3 block font-semibold">
                    Timezone
                  </label>
                  <select className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors">
                    <option>America/Chicago</option>
                    <option>America/New_York</option>
                    <option>America/Los_Angeles</option>
                    <option>Europe/London</option>
                  </select>
                </div>
              </div>

              {saveState.kind !== "idle" && (
                <div
                  className={`mt-6 p-3 rounded-lg text-sm font-medium ${
                    saveState.kind === "success"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {saveState.message}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <Lock className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600" />
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Password</h3>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block font-semibold">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block font-semibold">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block font-semibold">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <button
                  onClick={handlePasswordUpdate}
                  disabled={passwordLoading}
                  className="px-3 xs:px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 font-medium text-sm xs:text-base"
                >
                  {passwordLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  Update password
                </button>

                <p className="text-xs text-gray-500">Last changed 47 days ago</p>

                {passwordState.kind !== "idle" && (
                  <div
                    className={`p-3 rounded-lg text-sm font-medium ${
                      passwordState.kind === "success"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {passwordState.message}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <Shield className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600" />
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Security overview</h3>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4 p-3 xs:p-4 border border-gray-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm xs:text-base text-slate-900">Email verification</div>
                    <p className="text-xs xs:text-sm text-gray-600 truncate">{workEmail}</p>
                  </div>
                  <span className="text-green-700 text-xs xs:text-sm font-semibold whitespace-nowrap flex-shrink-0">Enabled</span>
                </div>

                <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4 p-3 xs:p-4 border border-gray-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm xs:text-base text-slate-900">Two-factor authentication</div>
                    <p className="text-xs xs:text-sm text-gray-600">TOTP authenticator app</p>
                  </div>
                  <button className="px-2 xs:px-3 py-1 border border-gray-300 rounded-lg text-xs xs:text-sm hover:bg-gray-50 transition-colors font-medium whitespace-nowrap flex-shrink-0">
                    Enable
                  </button>
                </div>

                <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4 p-3 xs:p-4 border border-gray-200 rounded-lg">
                  <div>
                    <div className="font-semibold text-slate-900">Active sessions</div>
                    <p className="text-sm text-gray-600">Chrome on macOS · Dallas, TX</p>
                  </div>
                  <button className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors font-medium">
                    Revoke all
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <div className="font-semibold text-slate-900">Single sign-on (SSO)</div>
                    <p className="text-sm text-gray-600">SAML 2.0 / Okta integration</p>
                  </div>
                  <span className="text-gray-500 text-sm">Enterprise only</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                <div className="text-xs sm:text-sm text-gray-600 mb-2">Current plan</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900">{planConfig.name}</div>
                <div className="text-base sm:text-lg font-semibold text-blue-600 mt-2">{planConfig.price}<span className="text-sm font-normal">/month</span></div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                <div className="text-xs sm:text-sm text-gray-600 mb-2">Next billing date</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900">
                  {billingData.next_billing_date
                    ? new Date(billingData.next_billing_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </div>
                <div className="text-xs sm:text-sm text-gray-600 mt-2">Auto-renews · Stripe</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                <div className="text-xs sm:text-sm text-gray-600 mb-2">Stripe status</div>
                <div className={`text-xl sm:text-2xl font-bold ${billingData.stripe_status === "active" ? "text-green-700" : "text-yellow-700"}`}>
                  {billingData.stripe_status ? prettyLabel(billingData.stripe_status) : "—"}
                </div>
                <div className={`text-xs sm:text-sm ${billingData.stripe_status === "active" ? "text-green-600" : "text-yellow-600"} mt-2`}>
                  {billingData.stripe_customer_id ? "Customer connected" : "Not connected"}
                </div>
              </div>
            </div>

            {/* Plan Comparison */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4 sm:mb-6 flex items-center gap-2">
                <CheckCircle2 className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600" />
                <span>Plan comparison</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {["Free trial", "Standard", "Growth", "Enterprise"].map((planName, idx) => {
                  const p = Object.values(getPlanMap())[idx];
                  const isCurrent = p.code === canonicalPlan;
                  return (
                    <div
                      key={p.code}
                      className={`rounded-2xl p-4 sm:p-6 border-2 transition-all ${
                        isCurrent
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      {isCurrent && (
                        <div className="mb-3 sm:mb-4">
                          <span className="inline-block px-2 sm:px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                            Current
                          </span>
                        </div>
                      )}
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 mb-2">{p.name}</div>
                      <div className={`text-xl sm:text-2xl font-bold mb-3 sm:mb-4 ${isCurrent ? "text-blue-600" : "text-slate-900"}`}>
                        {p.price}
                        <span className="text-xs sm:text-sm text-gray-600">/mo</span>
                      </div>

                      <div className="space-y-1 sm:space-y-2 mb-4 sm:mb-6 text-xs sm:text-sm">
                        <div className={p.max_companies === Infinity ? "text-gray-900" : "text-gray-600"}>
                          {p.max_companies === Infinity ? "✓" : "✗"} {p.max_companies === Infinity ? "Unlimited" : p.max_companies} companies
                        </div>
                        <div className={p.max_emails === Infinity ? "text-gray-900" : "text-gray-600"}>
                          {p.max_emails === Infinity ? "✓" : "✗"} {p.max_emails === Infinity ? "Unlimited" : p.max_emails} emails
                        </div>
                        <div className={p.enrichment_enabled ? "text-gray-900" : "text-gray-600"}>
                          {p.enrichment_enabled ? "✓" : "✗"} Enrichment
                        </div>
                        <div className={p.campaigns_enabled ? "text-gray-900" : "text-gray-600"}>
                          {p.campaigns_enabled ? "✓" : "✗"} Campaigns
                        </div>
                      </div>

                      {!isCurrent && p.code !== "free_trial" && (
                        <button
                          onClick={() => handleUpgrade(p.code)}
                          disabled={billingActionLoading}
                          className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-slate-900 rounded-lg text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          {billingActionLoading ? "Processing..." : "Upgrade"}
                        </button>
                      )}
                      {!isCurrent && canonicalPlan !== "free_trial" && (
                        <button className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-slate-900 rounded-lg text-xs sm:text-sm font-semibold transition-colors">
                          Downgrade
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Usage This Month */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4 sm:mb-6 flex items-center gap-2">
                <TrendingUp className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600" />
                <span>Usage this month</span>
              </h3>
              <div className="text-right text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
                Resets {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>

              <div className="space-y-4 sm:space-y-6">
                <UsageBar label="Companies viewed" current={billingData.usage.companies_viewed} max={planConfig.max_companies} />
                <UsageBar label="Emails sent" current={billingData.usage.emails_sent} max={planConfig.max_emails} />
                <UsageBar label="RFPs generated" current={billingData.usage.rfps_generated} max={planConfig.max_rfps} />
              </div>
            </div>

            {/* Billing History */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4 mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600" />
                  <span>Billing history</span>
                </h3>
                <button
                  onClick={handleManageSubscription}
                  disabled={billingActionLoading}
                  className="px-3 xs:px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-slate-900 text-sm xs:text-base transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {billingActionLoading ? "Opening..." : "Manage in Stripe"}
                </button>
              </div>

              <div className="space-y-2 sm:space-y-3">
                {billingData.billing_history && billingData.billing_history.length > 0 ? (
                  billingData.billing_history.map((item: any, idx: number) => (
                    <div key={idx} className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 xs:gap-3 p-3 xs:p-4 border border-gray-200 rounded-lg">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm xs:text-base text-slate-900">{item.month}</div>
                        <div className="text-xs xs:text-sm text-gray-600">{item.plan}</div>
                        <div className="text-xs text-gray-500 mt-1">{item.payment_method || "Payment method unavailable"}</div>
                      </div>
                      <div className="flex items-center gap-2 xs:gap-3 flex-wrap xs:flex-nowrap">
                        <span className={`px-2 xs:px-2.5 py-1 rounded text-xs font-semibold border whitespace-nowrap ${
                          item.status === "Paid"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-yellow-50 text-yellow-700 border-yellow-200"
                        }`}>
                          {item.status}
                        </span>
                        <span className="font-semibold text-sm xs:text-base text-slate-900 whitespace-nowrap">{item.amount}</span>
                        {item.invoice_url && (
                          <a href={item.invoice_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 text-xs xs:text-sm font-medium">PDF</a>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-sm text-gray-500">
                    {billingData.stripe_customer_id ? "No billing history yet" : "Connect to Stripe to view billing history"}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <Mail className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600" />
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Email notifications</h3>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {[
                  {
                    id: "weekly_digest",
                    label: "Weekly intelligence digest",
                    desc: "Summary of top freight trends and company signals",
                  },
                  {
                    id: "campaign_alerts",
                    label: "Campaign performance alerts",
                    desc: "Notify when open or reply rate crosses a threshold",
                  },
                  {
                    id: "rfp_updates",
                    label: "RFP status updates",
                    desc: "Email when an RFP is generated or expires",
                  },
                  {
                    id: "enrichment_completion",
                    label: "Data enrichment completion",
                    desc: "Alert when bulk enrichment jobs finish",
                  },
                ].map((notif) => (
                  <div
                    key={notif.id}
                    className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4 p-3 xs:p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm xs:text-base text-slate-900">{notif.label}</div>
                      <p className="text-xs xs:text-sm text-gray-600 mt-1">{notif.desc}</p>
                    </div>
                    <ToggleSwitch
                      checked={notifications[notif.id] ?? true}
                      onChange={(checked) =>
                        setNotifications((prev) => ({
                          ...prev,
                          [notif.id]: checked,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <Bell className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600" />
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">In-app notifications</h3>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {[
                  {
                    id: "new_company_alerts",
                    label: "New company match alerts",
                    desc: "Notify when a company matches your saved search filters",
                  },
                  {
                    id: "usage_warnings",
                    label: "Usage limit warnings",
                    desc: "Alert at 80% and 95% of monthly quota",
                  },
                  {
                    id: "team_activity",
                    label: "Team member activity",
                    desc: "Show when teammates run searches or generate RFPs",
                  },
                ].map((notif) => (
                  <div
                    key={notif.id}
                    className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4 p-3 xs:p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm xs:text-base text-slate-900">{notif.label}</div>
                      <p className="text-xs xs:text-sm text-gray-600 mt-1">{notif.desc}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <ToggleSwitch
                        checked={notifications[notif.id] ?? false}
                        onChange={(checked) =>
                          setNotifications((prev) => ({
                            ...prev,
                            [notif.id]: checked,
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <CreditCard className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600" />
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Billing & account</h3>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {[
                  {
                    id: "invoice_receipts",
                    label: "Invoice receipts",
                    desc: "Email PDF receipt on each successful charge",
                  },
                  {
                    id: "subscription_alerts",
                    label: "Subscription change alerts",
                    desc: "Notify on plan upgrades, downgrades, or cancellations",
                  },
                ].map((notif) => (
                  <div
                    key={notif.id}
                    className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4 p-3 xs:p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm xs:text-base text-slate-900">{notif.label}</div>
                      <p className="text-xs xs:text-sm text-gray-600 mt-1">{notif.desc}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <ToggleSwitch
                        checked={notifications[notif.id] ?? true}
                        onChange={(checked) =>
                          setNotifications((prev) => ({
                            ...prev,
                            [notif.id]: checked,
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "access" && (
          <div className="space-y-4 sm:space-y-6 animate-in fade-in">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4 mb-4 sm:mb-8">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600" />
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">Your access</h3>
                </div>
                <span className="px-2 sm:px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold border border-gray-300 whitespace-nowrap">
                  {prettyLabel(membershipRole || role, "User")}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
                    Role
                  </div>
                  <div className="text-base sm:text-lg font-semibold text-slate-900 truncate">
                    {prettyLabel(membershipRole || role, "User")}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
                    Plan
                  </div>
                  <div className="text-base sm:text-lg font-semibold text-slate-900 truncate">{displayPlan}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
                    Search access
                  </div>
                  <div className="text-base sm:text-lg text-green-700 font-semibold">Enabled</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
                    Enrichment
                  </div>
                  <div className="text-base sm:text-lg text-green-700 font-semibold">Enabled</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-3 xs:gap-4 mb-4 sm:mb-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600 flex-shrink-0" />
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900">Team members</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    {orgMembers.length} member{orgMembers.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="px-3 xs:px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs xs:text-sm font-semibold transition-colors text-slate-900 whitespace-nowrap flex-shrink-0"
                >
                  + Invite
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {orgMembers.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">
                    No team members yet
                  </div>
                ) : (
                  orgMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 xs:gap-3 p-3 xs:p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 xs:gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
                          {String(member.email || member.users?.email || "?")
                            .slice(0, 1)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm xs:text-base text-slate-900 truncate">
                            {member.email || member.users?.email || "Unknown"}
                          </div>
                          <div className="text-xs text-gray-500 capitalize">
                            {member.role || "member"}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 xs:px-2.5 py-1 rounded-full border whitespace-nowrap flex-shrink-0 ${
                          member.status === "invited"
                            ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                            : "bg-gray-50 text-gray-700 border-gray-200"
                        }`}
                      >
                        {member.status === "invited" ? "Invited" : "Active"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl p-4 sm:p-8 max-w-md w-full border border-gray-200 shadow-xl max-h-[90vh] overflow-y-auto">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4 sm:mb-6">Invite team member</h3>

                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block font-semibold">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="user@company.com"
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block font-semibold">
                        Role
                      </label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    </div>
                  </div>

                  {saveState.kind !== "idle" && (
                    <div
                      className={`mt-3 sm:mt-4 p-3 rounded-lg text-xs sm:text-sm font-medium ${
                        saveState.kind === "success"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {saveState.message}
                    </div>
                  )}

                  <div className="flex flex-col xs:flex-row gap-2 xs:gap-3 mt-4 sm:mt-6">
                    <button
                      onClick={() => {
                        setShowInviteModal(false);
                        setSaveState({ kind: "idle", message: "" });
                      }}
                      disabled={inviteLoading}
                      className="flex-1 px-3 xs:px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-slate-900 font-medium text-sm xs:text-base disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendInvite}
                      disabled={inviteLoading || !inviteEmail.trim()}
                      className="flex-1 px-3 xs:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium text-sm xs:text-base"
                    >
                      {inviteLoading ? "Sending..." : "Send invite"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "integrations" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 animate-in fade-in">
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
                className={`p-4 sm:p-6 rounded-2xl border transition-all ${
                  source.active
                    ? "border-blue-200 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex justify-between items-start mb-3 sm:mb-4">
                  <div className="text-2xl sm:text-3xl">{source.icon}</div>
                  <button className="w-10 h-6 rounded-full transition-all relative flex-shrink-0">
                    <div
                      className={`absolute inset-0 rounded-full transition-all ${
                        source.active ? "bg-blue-600" : "bg-gray-300"
                      }`}
                    />
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                        source.active ? "left-5" : "left-1"
                      }`}
                    />
                  </button>
                </div>
                <div className="font-semibold text-sm sm:text-base text-slate-900">{source.title}</div>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 mb-3 sm:mb-4 line-clamp-2">{source.desc}</p>
                <span
                  className={`text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-full border inline-block ${
                    source.active
                      ? "bg-blue-100 text-blue-700 border-blue-200"
                      : "bg-gray-100 text-gray-600 border-gray-300"
                  }`}
                >
                  {source.active ? "Operational" : "Disabled"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
