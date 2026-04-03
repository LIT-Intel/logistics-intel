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
      checked ? "bg-blue-500" : "bg-gray-600"
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
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, organization_name")
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
        .from("org_memberships")
        .select("org_id")
        .eq("user_id", targetUserId)
        .limit(1)
        .maybeSingle();

      if (membershipData?.org_id) {
        const { data: members } = await supabase
          .from("org_memberships")
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

  const handleSendInvite = async () => {
    if (!user?.id || !inviteEmail.trim()) return;

    setInviteLoading(true);
    try {
      const { data: membershipData } = await supabase
        .from("org_memberships")
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
    } catch (error) {
      console.error("[Settings] Invite failed:", error);
      alert("Failed to send invite. Please try again.");
    } finally {
      setInviteLoading(false);
    }
  };

  useEffect(() => {
    void loadSettingsData();
    void loadOrgMembers();
  }, [user?.id]);

  const initials = useMemo(
    () => getInitials(fullName, workEmail),
    [fullName, workEmail]
  );

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
    };
  }, [user, plan]);

  const canonicalPlan = getCanonicalPlan(String(plan || "free_trial"));
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

      const { data: savedProfile, error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            full_name: normalizedName || null,
            company_name: normalizedCompany || null,
          },
          { onConflict: "id" }
        )
        .select("id, full_name, company_name")
        .single();

      if (profileError) throw profileError;

      setProfile(savedProfile);
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
    <div className="w-full min-h-screen bg-slate-950 text-white font-sans">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400 mb-2">Workspace › Settings</div>
              <h1 className="text-4xl font-bold">Settings</h1>
              <p className="text-slate-400 mt-1">
                Manage your account, security, billing, and integrations
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDiscard}
                className="px-6 py-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !user}
                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === tab.id
                    ? "border-blue-500 text-white"
                    : "border-transparent text-slate-400 hover:text-slate-300"
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
            {/* Profile Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 bg-blue-600 rounded-xl flex items-center justify-center text-3xl font-bold">
                    {initials}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">
                      {loadingData ? "Loading..." : fullName || "Unnamed User"}
                    </h2>
                    <p className="text-slate-400 mt-1">
                      {membershipRole ? prettyLabel(membershipRole) : "User"}
                      {organizationName ? ` at ${organizationName}` : ""}
                    </p>
                    <button className="text-blue-400 hover:text-blue-300 text-sm mt-2">
                      Change avatar
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-blue-600/20 text-blue-300 rounded-full text-xs font-semibold">
                    {prettyLabel(plan, "Free Trial")}
                  </span>
                  <span className="px-3 py-1 bg-green-600/20 text-green-300 rounded-full text-xs font-semibold">
                    Active
                  </span>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-400 mb-3 block">
                    Full Name
                  </label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-400 mb-3 block">
                    Work Email
                  </label>
                  <input
                    value={workEmail}
                    disabled
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-400 mb-3 block">
                    Company Name
                  </label>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="Acme Inc."
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-400 mb-3 block">
                    Timezone
                  </label>
                  <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors">
                    <option>America/Chicago</option>
                    <option>America/New_York</option>
                    <option>America/Los_Angeles</option>
                    <option>Europe/London</option>
                    <option>Europe/Paris</option>
                  </select>
                </div>
              </div>

              {saveState.kind !== "idle" && (
                <div
                  className={`mt-6 p-3 rounded-lg text-sm ${
                    saveState.kind === "success"
                      ? "bg-green-900/30 text-green-300"
                      : "bg-red-900/30 text-red-300"
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
            {/* Password Management */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center gap-2 mb-6">
                <Lock className="w-5 h-5 text-blue-400" />
                <h3 className="text-xl font-bold">Password</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-400 mb-2 block">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-slate-400 mb-2 block">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-slate-400 mb-2 block">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <button
                  onClick={handlePasswordUpdate}
                  disabled={passwordLoading}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {passwordLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  Update password
                </button>

                <p className="text-xs text-slate-400">Last changed 47 days ago</p>

                {passwordState.kind !== "idle" && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      passwordState.kind === "success"
                        ? "bg-green-900/30 text-green-300"
                        : "bg-red-900/30 text-red-300"
                    }`}
                  >
                    {passwordState.message}
                  </div>
                )}
              </div>
            </div>

            {/* Security Overview */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center gap-2 mb-6">
                <Shield className="w-5 h-5 text-blue-400" />
                <h3 className="text-xl font-bold">Security overview</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-slate-800 rounded-lg">
                  <div>
                    <div className="font-semibold">Email verification</div>
                    <p className="text-sm text-slate-400">{workEmail}</p>
                  </div>
                  <span className="text-green-400 text-sm font-semibold">Enabled</span>
                </div>

                <div className="flex items-center justify-between p-4 border border-slate-800 rounded-lg">
                  <div>
                    <div className="font-semibold">Two-factor authentication</div>
                    <p className="text-sm text-slate-400">TOTP authenticator app</p>
                  </div>
                  <button className="px-3 py-1 border border-slate-600 rounded-lg text-sm hover:bg-slate-800 transition-colors">
                    Enable
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 border border-slate-800 rounded-lg">
                  <div>
                    <div className="font-semibold">Active sessions</div>
                    <p className="text-sm text-slate-400">Chrome on macOS · Dallas, TX</p>
                  </div>
                  <button className="px-3 py-1 border border-slate-600 rounded-lg text-sm hover:bg-slate-800 transition-colors">
                    Revoke all
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 border border-slate-800 rounded-lg">
                  <div>
                    <div className="font-semibold">Single sign-on (SSO)</div>
                    <p className="text-sm text-slate-400">SAML 2.0 / Okta integration</p>
                  </div>
                  <span className="text-slate-500 text-sm">Enterprise only</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-6 animate-in fade-in">
            {/* Current Plan */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-blue-400" />
                  <h3 className="text-xl font-bold">Current Plan</h3>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-blue-600/20 text-blue-300 rounded-full text-xs font-semibold">
                    {planConfig.name}
                  </span>
                  {subscriptionStatus && (
                    <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-xs font-semibold capitalize">
                      {subscriptionStatus}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-6">
                <div>
                  <h4 className="font-semibold mb-4">Plan Features</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Companies per month</span>
                      <span>
                        {planConfig.max_companies === Infinity
                          ? "Unlimited"
                          : Number(planConfig.max_companies).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Emails per month</span>
                      <span>
                        {planConfig.max_emails === Infinity
                          ? "Unlimited"
                          : Number(planConfig.max_emails).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Data enrichment</span>
                      <span>{planConfig.enrichment_enabled ? "Enabled" : "Disabled"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Campaign automation</span>
                      <span>{planConfig.campaigns_enabled ? "Enabled" : "Disabled"}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-4">Billing Information</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Plan price</span>
                      <span>{planConfig.price}/month</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Subscription state</span>
                      <span capitalize>{subscriptionStatus || "Not subscribed"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Next billing date</span>
                      <span>
                        {hasActiveSubscription ? "Expected via Stripe" : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {hasActiveSubscription ? (
                  <button
                    onClick={handleManageSubscription}
                    disabled={billingActionLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {billingActionLoading ? "Opening..." : "Manage Subscription"}
                  </button>
                ) : (
                  upgradePlans.map((upgrade) => (
                    <button
                      key={upgrade.code}
                      onClick={() => handleUpgrade(upgrade.code)}
                      disabled={billingActionLoading}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {billingActionLoading
                        ? "Processing..."
                        : `Upgrade to ${upgrade.name}`}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-6 animate-in fade-in">
            {/* Email Notifications */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center gap-2 mb-6">
                <Mail className="w-5 h-5 text-blue-400" />
                <h3 className="text-xl font-bold">Email notifications</h3>
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
                    className="flex items-center justify-between p-4 border border-slate-800 rounded-lg"
                  >
                    <div>
                      <div className="font-semibold">{notif.label}</div>
                      <p className="text-sm text-slate-400 mt-1">{notif.desc}</p>
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

            {/* In-app Notifications */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center gap-2 mb-6">
                <Bell className="w-5 h-5 text-blue-400" />
                <h3 className="text-xl font-bold">In-app notifications</h3>
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
                    className="flex items-center justify-between p-4 border border-slate-800 rounded-lg"
                  >
                    <div>
                      <div className="font-semibold">{notif.label}</div>
                      <p className="text-sm text-slate-400 mt-1">{notif.desc}</p>
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

            {/* Billing & Account */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center gap-2 mb-6">
                <CreditCard className="w-5 h-5 text-blue-400" />
                <h3 className="text-xl font-bold">Billing & account</h3>
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
                    className="flex items-center justify-between p-4 border border-slate-800 rounded-lg"
                  >
                    <div>
                      <div className="font-semibold">{notif.label}</div>
                      <p className="text-sm text-slate-400 mt-1">{notif.desc}</p>
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
            {/* Your Access */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  <h3 className="text-xl font-bold">Your access</h3>
                </div>
                <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-xs font-semibold">
                  {prettyLabel(membershipRole || role, "User")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
                    Role
                  </div>
                  <div className="text-lg font-semibold">
                    {prettyLabel(membershipRole || role, "User")}
                  </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
                    Plan
                  </div>
                  <div className="text-lg font-semibold">{displayPlan}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
                    Search access
                  </div>
                  <div className="text-green-400 font-semibold">Enabled</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
                    Enrichment access
                  </div>
                  <div className="text-green-400 font-semibold">Enabled</div>
                </div>
              </div>
            </div>

            {/* Team Members */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-400" />
                    <h3 className="text-xl font-bold">Team members</h3>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    {orgMembers.length} member{orgMembers.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors"
                >
                  + Invite member
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {orgMembers.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    No team members yet
                  </div>
                ) : (
                  orgMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 border border-slate-800 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">
                          {String(member.email || member.users?.email || "?")
                            .slice(0, 1)
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold">
                            {member.email || member.users?.email || "Unknown"}
                          </div>
                          <div className="text-xs text-slate-400 capitalize">
                            {member.role || "member"}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          member.status === "invited"
                            ? "bg-yellow-900/30 text-yellow-300"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {member.status === "invited" ? "Invited" : "Admin"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full mx-4">
                  <h3 className="text-xl font-bold mb-6">Invite team member</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs uppercase tracking-wider text-slate-400 mb-2 block">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="user@company.com"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-xs uppercase tracking-wider text-slate-400 mb-2 block">
                        Role
                      </label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => setShowInviteModal(false)}
                      className="flex-1 px-4 py-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendInvite}
                      disabled={inviteLoading || !inviteEmail.trim()}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
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
                    ? "border-blue-600/50 bg-blue-600/10"
                    : "border-slate-800 bg-slate-900"
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="text-3xl">{source.icon}</div>
                  <button className="w-10 h-6 rounded-full bg-slate-700 relative">
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full transition-all ${
                        source.active ? "bg-blue-500 left-5" : "bg-slate-500"
                      }`}
                    />
                  </button>
                </div>
                <div className="font-semibold">{source.title}</div>
                <p className="text-sm text-slate-400 mt-1 mb-4">{source.desc}</p>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded ${
                    source.active
                      ? "bg-blue-600/20 text-blue-300"
                      : "bg-slate-800 text-slate-400"
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
