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
import AdminPricingEditor from "@/components/AdminPricingEditor";

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
  const { user, role, plan, access } = useAuth();

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

  // Plans loaded from DB — the single source of truth for billing tab and upgrade cards.
  const [dbPlans, setDbPlans] = useState<any[]>([]);
  // Active subscription row for the current user.
  const [subscription, setSubscription] = useState<any>(null);

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
        .from("profiles")
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
        // NOTE: org_members has no FK to public.users, so we cannot use
        // a Supabase join for email. We select only the columns that exist
        // on the table itself. Email display falls back to user_id.
        const { data: members } = await supabase
          .from("org_members")
          .select("id, user_id, role, created_at")
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

  // Load active plans from DB so Billing tab reflects what Admin saved.
  const loadBillingPlans = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) {
        console.warn("[Settings] Failed to load plans from DB:", error.message);
        return;
      }
      setDbPlans(data || []);
    } catch (err) {
      console.warn("[Settings] Exception loading plans:", err);
    }
  };

  // Load the user's current subscription row.
  const loadSubscription = async (userId?: string) => {
    const targetUserId = userId ?? user?.id;
    if (!targetUserId) return;

    try {
      const { data, error } = await (supabase as any)
        .from("subscriptions")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("[Settings] Failed to load subscription:", error.message);
        return;
      }
      setSubscription(data || null);
    } catch (err) {
      console.warn("[Settings] Exception loading subscription:", err);
    }
  };

  useEffect(() => {
    void loadSettingsData();
    void loadOrgMembers();
    void loadBillingPlans();
    void loadSubscription();
  }, [user?.id]);

  const initials = useMemo(
    () => getInitials(fullName, workEmail),
    [fullName, workEmail]
  );

  const displayPlan = useMemo(() => prettyLabel(plan, "Free Trial"), [plan]);
  const isAdmin = Boolean(access?.isAdmin);

  // Determine the effective plan code — prefer live subscription > auth context > default
  const effectivePlanCode = subscription?.plan_code
    ? getCanonicalPlan(subscription.plan_code)
    : getCanonicalPlan(String(plan || "free_trial"));

  const canonicalPlan = effectivePlanCode;

  // planConfig: prefer DB plan row; fall back to hardcoded map for offline/dev
  const dbCurrentPlan = dbPlans.find((p: any) => getCanonicalPlan(p.code) === canonicalPlan);
  const planConfig = dbCurrentPlan
    ? {
        code: dbCurrentPlan.code,
        name: dbCurrentPlan.name,
        price: dbCurrentPlan.price_monthly != null ? `$${dbCurrentPlan.price_monthly}` : "Custom",
        max_companies: dbCurrentPlan.max_companies ?? Infinity,
        max_emails: dbCurrentPlan.max_emails ?? Infinity,
        max_rfps: dbCurrentPlan.max_rfps ?? Infinity,
        enrichment_enabled: dbCurrentPlan.enrichment_enabled,
        campaigns_enabled: dbCurrentPlan.campaigns_enabled,
      }
    : getPlanLimits(canonicalPlan);

  // upgradePlans: from DB when available; else hardcoded
  const upgradePlans = (dbPlans.length > 0 ? dbPlans : Object.values(getPlanMap())).filter(
    (p: any) => {
      const code = getCanonicalPlan(p.code);
      return code !== canonicalPlan && code !== "free_trial";
    }
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
        .from("profiles")
        .upsert(
          {
            id: user.id,
            full_name: normalizedName || null,
            company_name: normalizedCompany || null,
          },
          { onConflict: "id" }
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
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500 mb-2">Workspace › Settings</div>
              <h1 className="text-4xl font-bold text-slate-900">Settings</h1>
              <p className="text-gray-600 mt-1">
                Manage your account, security, billing, and integrations
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDiscard}
                className="px-6 py-2 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 transition-colors text-slate-900 font-medium"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !user}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-12">
        {activeTab === "account" && (
          <div className="space-y-8 animate-in fade-in">
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 bg-blue-600 rounded-2xl flex items-center justify-center text-3xl font-bold text-white">
                    {initials}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">
                      {loadingData ? "Loading..." : fullName || "Unnamed User"}
                    </h2>
                    <p className="text-gray-600 mt-1">
                      {membershipRole ? prettyLabel(membershipRole) : "User"}
                      {organizationName ? ` at ${organizationName}` : ""}
                    </p>
                    <button className="text-blue-600 hover:text-blue-700 text-sm mt-2 font-medium">
                      Change avatar
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-200">
                    {prettyLabel(plan, "Free Trial")}
                  </span>
                  <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold border border-green-200">
                    Active
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs uppercase tracking-wider text-gray-500 mb-3 block font-semibold">
                    Full Name
                  </label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-gray-500 mb-3 block font-semibold">
                    Work Email
                  </label>
                  <input
                    value={workEmail}
                    disabled
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-gray-500 mb-3 block font-semibold">
                    Company Name
                  </label>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                    placeholder="Acme Inc."
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-gray-500 mb-3 block font-semibold">
                    Timezone
                  </label>
                  <select className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors">
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
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Lock className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-bold text-slate-900">Password</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block font-semibold">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block font-semibold">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
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
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <button
                  onClick={handlePasswordUpdate}
                  disabled={passwordLoading}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 font-medium"
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

            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-bold text-slate-900">Security overview</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <div className="font-semibold text-slate-900">Email verification</div>
                    <p className="text-sm text-gray-600">{workEmail}</p>
                  </div>
                  <span className="text-green-700 text-sm font-semibold">Enabled</span>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <div className="font-semibold text-slate-900">Two-factor authentication</div>
                    <p className="text-sm text-gray-600">TOTP authenticator app</p>
                  </div>
                  <button className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors font-medium">
                    Enable
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
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
          <div className="space-y-6 animate-in fade-in">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="text-sm text-gray-600 mb-2">Current plan</div>
                <div className="text-2xl font-bold text-slate-900">{planConfig.name}</div>
                <div className="text-lg font-semibold text-blue-600 mt-2">
                  {planConfig.price !== "Custom" ? `${planConfig.price}/month` : "Custom pricing"}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="text-sm text-gray-600 mb-2">Next billing date</div>
                {subscription?.current_period_end ? (
                  <>
                    <div className="text-2xl font-bold text-slate-900">
                      {new Date(subscription.current_period_end).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="text-sm text-gray-600 mt-2">Auto-renews · Stripe</div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-slate-400">—</div>
                    <div className="text-sm text-gray-500 mt-2">No active subscription</div>
                  </>
                )}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="text-sm text-gray-600 mb-2">Stripe status</div>
                {subscription?.stripe_customer_id ? (
                  <>
                    <div className={`text-2xl font-bold ${
                      subscription.status === "active" || subscription.status === "trialing"
                        ? "text-green-700"
                        : "text-amber-600"
                    }`}>
                      {String(subscription.status || "incomplete")
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                    </div>
                    <div className="text-sm text-gray-500 mt-2">
                      Customer: {subscription.stripe_customer_id.slice(0, 12)}…
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-slate-400">Not connected</div>
                    <div className="text-sm text-gray-500 mt-2">Upgrade to connect Stripe</div>
                  </>
                )}
              </div>
            </div>

            {/* Plan Comparison */}
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
                Plan comparison
              </h3>

              {/* Plan cards: sourced from DB plans when available, hardcoded fallback */}
              <div className="grid grid-cols-4 gap-4">
                {(dbPlans.length > 0 ? dbPlans : Object.values(getPlanMap())).map((p: any) => {
                  const pCode = getCanonicalPlan(p.code);
                  const isCurrent = pCode === canonicalPlan;
                  const priceDisplay = p.price_monthly != null
                    ? `$${p.price_monthly}`
                    : (p.price ?? "Custom");
                  const maxCo = p.max_companies ?? Infinity;
                  const maxEm = p.max_emails ?? Infinity;
                  return (
                    <div
                      key={p.code}
                      className={`rounded-2xl p-6 border-2 transition-all ${
                        isCurrent
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      {isCurrent && (
                        <div className="mb-4">
                          <span className="inline-block px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                            Current
                          </span>
                        </div>
                      )}
                      <div className="text-sm font-semibold text-slate-900 mb-2">{p.name}</div>
                      <div className={`text-2xl font-bold mb-4 ${isCurrent ? "text-blue-600" : "text-slate-900"}`}>
                        {priceDisplay}
                        {p.price_monthly != null && <span className="text-sm text-gray-600">/mo</span>}
                      </div>

                      <div className="space-y-2 mb-6 text-sm">
                        <div className={maxCo === Infinity ? "text-gray-900" : "text-gray-600"}>
                          {maxCo === Infinity ? "✓" : "✗"} {maxCo === Infinity ? "Unlimited" : maxCo} companies
                        </div>
                        <div className={maxEm === Infinity ? "text-gray-900" : "text-gray-600"}>
                          {maxEm === Infinity ? "✓" : "✗"} {maxEm === Infinity ? "Unlimited" : maxEm} emails
                        </div>
                        <div className={p.enrichment_enabled ? "text-gray-900" : "text-gray-600"}>
                          {p.enrichment_enabled ? "✓" : "✗"} Enrichment
                        </div>
                        <div className={p.campaigns_enabled ? "text-gray-900" : "text-gray-600"}>
                          {p.campaigns_enabled ? "✓" : "✗"} Campaigns
                        </div>
                      </div>

                      {!isCurrent && pCode !== "free_trial" && (
                        <button
                          onClick={() => handleUpgrade(p.code)}
                          disabled={billingActionLoading}
                          className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-slate-900 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          {billingActionLoading ? "Processing..." : "Upgrade"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Usage This Month */}
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Usage this month
              </h3>
              <div className="text-right text-sm text-gray-600 mb-4">Resets May 1</div>

              <div className="space-y-6">
                <UsageBar label="Companies viewed" current={312} max={planConfig.max_companies} />
                <UsageBar label="Emails sent" current={1840} max={planConfig.max_emails} />
                <UsageBar label="RFPs generated" current={47} max={planConfig.max_rfps} />
              </div>
            </div>

            {/* Billing History */}
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Billing history
                </h3>
                <button
                  onClick={handleManageSubscription}
                  disabled={billingActionLoading}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-slate-900 transition-colors disabled:opacity-50"
                >
                  {billingActionLoading ? "Opening..." : "Manage in Stripe"}
                </button>
              </div>

              {subscription?.stripe_customer_id ? (
                <div className="text-sm text-gray-500 py-4 text-center">
                  Full billing history is available in the{" "}
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={handleManageSubscription}
                  >
                    Stripe billing portal
                  </button>
                  .
                </div>
              ) : (
                <div className="text-sm text-gray-500 py-4 text-center">
                  No billing history — no active Stripe subscription found.
                </div>
              )}
            </div>

            {/* Admin Pricing Editor — only visible to admin users */}
            {isAdmin && (
              <div className="bg-white rounded-xl border border-amber-200 p-8 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <h3 className="text-xl font-bold text-slate-900">Admin: Plan Configuration</h3>
                  <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded-full border border-amber-200">
                    Admin only
                  </span>
                </div>
                <AdminPricingEditor />
              </div>
            )}
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Mail className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-bold text-slate-900">Email notifications</h3>
              </div>

              <div className="space-y-4">
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
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{notif.label}</div>
                      <p className="text-sm text-gray-600 mt-1">{notif.desc}</p>
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

            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Bell className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-bold text-slate-900">In-app notifications</h3>
              </div>

              <div className="space-y-4">
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
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{notif.label}</div>
                      <p className="text-sm text-gray-600 mt-1">{notif.desc}</p>
                    </div>
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
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-bold text-slate-900">Billing & account</h3>
              </div>

              <div className="space-y-4">
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
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{notif.label}</div>
                      <p className="text-sm text-gray-600 mt-1">{notif.desc}</p>
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
          </div>
        )}

        {activeTab === "access" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  <h3 className="text-xl font-bold text-slate-900">Your access</h3>
                </div>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold border border-gray-300">
                  {prettyLabel(membershipRole || role, "User")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
                    Role
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {prettyLabel(membershipRole || role, "User")}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
                    Plan
                  </div>
                  <div className="text-lg font-semibold text-slate-900">{displayPlan}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
                    Search access
                  </div>
                  <div className="text-green-700 font-semibold">Enabled</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
                    Enrichment access
                  </div>
                  <div className="text-green-700 font-semibold">Enabled</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <h3 className="text-xl font-bold text-slate-900">Team members</h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {orgMembers.length} member{orgMembers.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold transition-colors text-slate-900"
                >
                  + Invite member
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {orgMembers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No team members yet
                  </div>
                ) : (
                  orgMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                          {String(member.email || member.user_id || "?")
                            .slice(0, 1)
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 text-xs font-mono">
                            {member.email || member.user_id || "Unknown"}
                          </div>
                          <div className="text-xs text-gray-500 capitalize">
                            {member.role || "member"}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
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
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 border border-gray-200 shadow-xl">
                  <h3 className="text-xl font-bold text-slate-900 mb-6">Invite team member</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block font-semibold">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="user@company.com"
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-slate-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-xs uppercase tracking-wider text-gray-500 mb-2 block font-semibold">
                        Role
                      </label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    </div>
                  </div>

                  {saveState.kind !== "idle" && (
                    <div
                      className={`mt-4 p-3 rounded-lg text-sm font-medium ${
                        saveState.kind === "success"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {saveState.message}
                    </div>
                  )}

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => {
                        setShowInviteModal(false);
                        setSaveState({ kind: "idle", message: "" });
                      }}
                      disabled={inviteLoading}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-slate-900 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendInvite}
                      disabled={inviteLoading || !inviteEmail.trim()}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
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
          <div className="grid grid-cols-2 gap-6 animate-in fade-in">
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
                className={`p-6 rounded-2xl border transition-all ${
                  source.active
                    ? "border-blue-200 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="text-3xl">{source.icon}</div>
                  <button className="w-10 h-6 rounded-full transition-all relative">
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
                <div className="font-semibold text-slate-900">{source.title}</div>
                <p className="text-sm text-gray-600 mt-1 mb-4">{source.desc}</p>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
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
