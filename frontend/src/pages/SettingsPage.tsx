import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { updateProfile } from "@/auth/supabaseAuthClient";
import { UploadFile } from "@/api/integrations";
import SettingsLayout from "@/components/settings/SettingsLayout";

const ADMIN_EMAILS = ["vraymond@sparkfusiondigital.com"];

const PLAN_RANK: Record<string, number> = {
  free_trial: 0,
  standard: 1,
  growth: 2,
  enterprise: 3,
};

export default function SettingsPage() {
  const { user, plan } = useAuth();

  function normalizeError(error: any, fallback: string) {
    return error?.message || fallback;
  }

  // Core profile state
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [orgProfile, setOrgProfile] = useState<Record<string, any>>({});
  const [preferences, setPreferences] = useState<Record<string, any>>({});

  // Team state
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [orgInvites, setOrgInvites] = useState<any[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Billing state
  const [subscription, setSubscription] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);

  // Security / Credits state
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [tokenUsage, setTokenUsage] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);

  // Stats for profile section
  const [savedCount, setSavedCount] = useState(0);
  const [campaignCount, setCampaignCount] = useState(0);
  const [rfpCount, setRfpCount] = useState(0);

  const isAdminEmail =
    ADMIN_EMAILS.includes(user?.email ?? "") ||
    user?.user_metadata?.role === "admin";
  const isOrgOwner = orgMembers.some(
    (m) => m.user_id === user?.id && (m.role === "owner" || m.role === "admin")
  );
  const isAdmin = isAdminEmail || isOrgOwner;

  const canAccess = useCallback(
    (minPlan: string) => isAdmin || (PLAN_RANK[plan ?? "free_trial"] ?? 0) >= (PLAN_RANK[minPlan] ?? 0),
    [isAdmin, plan]
  );

  // ─── Loaders ────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;

    // 1. user_profiles (extended profile)
    const { data: userProfileData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();

    // 2. profiles (display name / company)
    const { data: baseProfileData } = await supabase
      .from("profiles")
      .select("full_name, company_name, organization_name")
      .eq("id", uid)
      .maybeSingle();

    setProfile({
      name: userProfileData?.full_name || baseProfileData?.full_name || user?.user_metadata?.full_name || "",
      title: userProfileData?.title || "",
      phone: userProfileData?.phone || "",
      location: userProfileData?.location || "",
      bio: userProfileData?.bio || "",
      avatar_url: userProfileData?.avatar_url || baseProfileData?.avatar_url || user?.user_metadata?.avatar_url || "",
      email: user?.email || "",
      plan: isAdmin ? "admin" : (plan ?? "free_trial"),
      isAdmin,
    });

    // 3. user_preferences
    const { data: prefsData } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    setPreferences(prefsData ?? {});

    // 4. Org membership → org_id
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();
    const currentOrgId = membership?.org_id ?? null;
    setOrgId(currentOrgId);

    // 5. org profile
    if (currentOrgId) {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", currentOrgId)
        .maybeSingle();
      setOrgProfile({
        ...(orgData ?? {}),
        company: orgData?.name ?? orgData?.company ?? "",
        supportEmail: orgData?.support_email ?? orgData?.supportEmail ?? "",
        address: orgData?.address ?? "",
        timezone: orgData?.timezone ?? "",
      });

      // 6. org members
      const { data: membersData } = await supabase
        .from("org_members")
        .select("id, user_id, role, status, created_at, email, full_name")
        .eq("org_id", currentOrgId)
        .order("created_at", { ascending: false });
      setOrgMembers(membersData ?? []);

      // 7. pending invites
      const { data: invitesData } = await supabase
        .from("org_invites")
        .select("id, email, role, status, created_at, expires_at")
        .eq("org_id", currentOrgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setOrgInvites(invitesData ?? []);
    }

    // 8. subscription + plans
    const [subResult, plansResult] = await Promise.allSettled([
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("plans").select("*").order("price_monthly", { ascending: true }),
    ]);
    if (subResult.status === "fulfilled") setSubscription(subResult.value.data ?? null);
    if (plansResult.status === "fulfilled") {
      // DB column is "code" but UI expects "plan_code" — map here
      const rawPlans = plansResult.value.data ?? [];
      setPlans(rawPlans.map((p: any) => ({ ...p, plan_code: p.plan_code ?? p.code })));
    }

    // 9. api keys
    const { data: keysData } = await supabase
      .from("api_keys")
      .select("id, key_name, key_prefix, last_used_at, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    setApiKeys(keysData ?? []);

    // 10. audit log (last 20)
    const { data: auditData } = await supabase
      .from("security_audit_log")
      .select("id, action, ip_address, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);
    setAuditLog(auditData ?? []);

    // 11. token ledger
    const { data: tokenData } = await supabase
      .from("token_ledger")
      .select("feature, tokens_used")
      .eq("user_id", uid);
    setTokenUsage(tokenData ?? []);

    // 12. integrations
    const { data: intData } = await supabase
      .from("integrations")
      .select("id, integration_type, type, created_at")
      .eq("user_id", uid);
    setIntegrations(intData ?? []);

    // 13. quick stats for profile bar
    const [savedRes, campRes, rfpRes] = await Promise.allSettled([
      supabase.from("saved_companies").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("lit_campaigns").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("lit_rfps").select("id", { count: "exact", head: true }).eq("user_id", uid),
    ]);
    if (savedRes.status === "fulfilled") setSavedCount(savedRes.value.count ?? 0);
    if (campRes.status === "fulfilled") setCampaignCount(campRes.value.count ?? 0);
    if (rfpRes.status === "fulfilled") setRfpCount(rfpRes.value.count ?? 0);
  }, [user?.id, plan, isAdmin]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ─── Save handlers ──────────────────────────────────────────────────────────

  const onSaveProfile = async (data: Record<string, unknown>): Promise<{ error?: string }> => {
    const uid = user?.id;
    if (!uid) return { error: "Not authenticated" };

    const updates: Record<string, unknown> = { user_id: uid };
    if (data.name !== undefined) updates.full_name = String(data.name || "").trim() || null;
    if (data.title !== undefined) updates.title = String(data.title || "").trim() || null;
    if (data.phone !== undefined) updates.phone = String(data.phone || "").trim() || null;
    if (data.location !== undefined) updates.location = String(data.location || "").trim() || null;
    if (data.bio !== undefined) updates.bio = String(data.bio || "").trim() || null;

    const { error } = await supabase
      .from("user_profiles")
      .upsert(updates, { onConflict: "user_id" });

    if (error) {
      console.error("[onSaveProfile] upsert failed:", error.message, error);
      return { error: normalizeError(error, "Failed saving profile") };
    }

    if (data.name) {
      await updateProfile({ full_name: String(data.name) }).catch((e) =>
        console.warn("[onSaveProfile] updateProfile metadata failed:", e)
      );
    }

    await loadAll();
    return {};
  }

    const updates: Record<string, unknown> = { user_id: uid };
    if (data.name !== undefined) updates.full_name = String(data.name || "").trim() || null;
    if (data.title !== undefined) updates.title = String(data.title || "").trim() || null;
    if (data.phone !== undefined) updates.phone = String(data.phone || "").trim() || null;
    if (data.location !== undefined) updates.location = String(data.location || "").trim() || null;
    if (data.bio !== undefined) updates.bio = String(data.bio || "").trim() || null;

    const { error } = await supabase
      .from("user_profiles")
      .upsert(updates, { onConflict: "user_id" });

    if (error) {
      console.error("[onSaveProfile] upsert failed:", error.message, error);
      return { error: error.message };
    }

    // Also update auth metadata full_name
    if (data.name) {
      await updateProfile({ full_name: String(data.name) }).catch((e) =>
        console.warn("[onSaveProfile] updateProfile metadata failed:", e)
      );
    }

    await loadAll();
    return {};
  };

  const onUploadAvatar = async (file: File): Promise<{ error?: string }> => {
    const uid = user?.id;
    if (!uid) return { error: "Not authenticated" };

    const result = await UploadFile({ file });
    if (!result?.file_url) return { error: "Avatar upload failed" };

    const avatarUrl = result.file_url;

    const { error: userProfilesError } = await supabase
      .from("user_profiles")
      .upsert({ user_id: uid, avatar_url: avatarUrl }, { onConflict: "user_id" });
    if (userProfilesError) return { error: normalizeError(userProfilesError, "Failed saving avatar") };

    const { error: profilesError } = await supabase
      .from("profiles")
      .upsert({ id: uid, avatar_url: avatarUrl }, { onConflict: "id" });
    if (profilesError) return { error: normalizeError(profilesError, "Failed saving avatar") };

    await updateProfile({ avatar_url: avatarUrl }).catch((e) =>
      console.warn("[onUploadAvatar] updateProfile metadata failed:", e)
    );

    setProfile((prev) => ({ ...prev, avatar_url: avatarUrl }));
    await loadAll();
    return {};
  }

  const onSaveOrgProfile = async (data: Record<string, unknown>): Promise<{ error?: string }> => {
    if (!orgId) return { error: "No organization found" };
    const updates: Record<string, unknown> = { id: orgId };
    if (data.company !== undefined) updates.name = String(data.company || "").trim() || null;
    if (data.tagline !== undefined) updates.tagline = String(data.tagline || "").trim() || null;
    if (data.website !== undefined) updates.website = String(data.website || "").trim() || null;
    if (data.logo_url !== undefined) updates.logo_url = data.logo_url || null;
    if (data.industry !== undefined) updates.industry = data.industry || null;
    if (data.size !== undefined) updates.size = data.size || null;
    if (data.supportEmail !== undefined) updates.support_email = String(data.supportEmail || "").trim() || null;
    if (data.address !== undefined) updates.address = String(data.address || "").trim() || null;
    if (data.timezone !== undefined) updates.timezone = String(data.timezone || "").trim() || null;

    const { error } = await supabase.from("organizations").upsert(updates, { onConflict: "id" });
    if (error) {
      console.error("[onSaveOrgProfile] upsert failed:", error.message, error);
      return { error: normalizeError(error, "Failed saving organization profile") };
    }

    setOrgProfile((prev) => ({
      ...prev,
      ...updates,
      company: updates.name ?? prev.company ?? "",
      supportEmail: updates.support_email ?? prev.supportEmail ?? "",
    }));
    await loadAll();
    return {};
  }

  const onSaveEmailSignature = async (signature: string): Promise<{ error?: string }> => {
    const uid = user?.id;
    if (!uid) return { error: "Not authenticated" };
    const { error } = await supabase
      .from("user_preferences")
      .upsert({ user_id: uid, email_signature: signature }, { onConflict: "user_id" });
    if (error) {
      console.error("[onSaveEmailSignature] upsert failed:", error.message, error);
      return { error: normalizeError(error, "Failed saving email signature") };
    }
    setPreferences((prev) => ({ ...prev, email_signature: signature }));
    await loadAll();
    return {};
  }

  const onUploadLogo = async (file: File): Promise<{ error?: string }> => {
    if (!orgId) return { error: "No organization found" };
    const result = await UploadFile({ file });
    if (!result?.file_url) return { error: "Logo upload failed" };

    const { error } = await supabase
      .from("organizations")
      .update({ logo_url: result.file_url })
      .eq("id", orgId);

    if (error) {
      console.error("[onUploadLogo] update failed:", error.message, error);
      return { error: normalizeError(error, "Failed saving company logo") };
    }

    setOrgProfile((prev) => ({ ...prev, logo_url: result.file_url }));
    await loadAll();
    return {};
  }

  const onSavePreferences = async (section: string, data: Record<string, unknown>): Promise<{ error?: string }> => {
    const uid = user?.id;
    if (!uid) return { error: "Not authenticated" };
    const { data: existing } = await supabase
      .from("user_preferences")
      .select("preferences, email_signature")
      .eq("user_id", uid)
      .maybeSingle();
    const merged = { ...(existing?.preferences ?? {}), [section]: data };
    const payload: Record<string, any> = { user_id: uid, preferences: merged };
    if (existing?.email_signature !== undefined) payload.email_signature = existing.email_signature;
    else if (preferences?.email_signature !== undefined) payload.email_signature = preferences.email_signature;
    const { error } = await supabase
      .from("user_preferences")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      console.error(`[onSavePreferences:${section}] upsert failed:`, error.message, error);
      return { error: normalizeError(error, `Failed saving ${section} preferences`) };
    }
    setPreferences((prev: any) => ({ ...prev, preferences: merged }));
    return {};
  }

  const onInviteMember = async (email: string, role: string): Promise<{ error?: string }> => {
    if (!orgId) return { error: "No organization found" };
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("org_invites").insert({
      org_id: orgId,
      email: email.trim().toLowerCase(),
      role,
      token,
      status: "pending",
      expires_at: expiresAt,
    });
    if (error) {
      console.error("[onInviteMember] insert failed:", error.message, error);
      return { error: normalizeError(error, "Failed creating invite") };
    }
    await loadAll();
    return {};
  }

  const onRevokeMember = async (memberId: string): Promise<{ error?: string }> => {
    const { error } = await supabase.from("org_members").delete().eq("id", memberId);
    if (error) {
      console.error("[onRevokeMember] delete failed:", error.message, error);
      return { error: normalizeError(error, "Failed revoking member") };
    }
    setOrgMembers((prev) => prev.filter((m) => m.id !== memberId));
    return {};
  }

  const onUpdateMemberRole = async (memberId: string, role: string): Promise<{ error?: string }> => {
    const { error } = await supabase.from("org_members").update({ role }).eq("id", memberId);
    if (error) {
      console.error("[onUpdateMemberRole] update failed:", error.message, error);
      return { error: normalizeError(error, "Failed updating member role") };
    }
    setOrgMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    return {};
  }

  const onRevokeInvite = async (inviteId: string): Promise<{ error?: string }> => {
    const { error } = await supabase.from("org_invites").delete().eq("id", inviteId);
    if (error) {
      console.error("[onRevokeInvite] delete failed:", error.message, error);
      return { error: normalizeError(error, "Failed revoking invite") };
    }
    setOrgInvites((prev) => prev.filter((i) => i.id !== inviteId));
    return {};
  }

  const onGenerateApiKey = async (keyName: string) => {
    const uid = user?.id;
    if (!uid) return null;

    // Generate a secure key using Web Crypto
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const hexKey = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const fullKey = `lit_${hexKey}`;
    const keyPrefix = fullKey.slice(0, 12);

    // Hash the key
    const encoder = new TextEncoder();
    const keyBuffer = encoder.encode(fullKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", keyBuffer);
    const keyHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data } = await supabase.from("api_keys").insert({
      user_id: uid,
      key_name: keyName,
      key_prefix: keyPrefix,
      key_hash: keyHash,
    }).select("id").single();

    if (data?.id) {
      await loadAll();
    }

    return fullKey; // show once to user
  };

  const onRevokeApiKey = async (keyId: string) => {
    await supabase.from("api_keys").delete().eq("id", keyId);
    setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
  };

  const onDisconnectIntegration = async (integrationId: string) => {
    await supabase.from("integrations").delete().eq("id", integrationId);
    setIntegrations((prev) => prev.filter((i) => i.id !== integrationId));
  };

  // Build merged profile with stats
  const profileWithStats = {
    ...profile,
    savedCount,
    campaignsCount: campaignCount,
    rfpsCount: rfpCount,
  };

  return (
    <div className="min-h-full bg-slate-100 p-4 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1600px]">
      <SettingsLayout
        profile={profileWithStats}
        orgProfile={orgProfile}
        preferences={preferences}
        subscription={subscription ?? undefined}
        plans={plans}
        members={orgMembers}
        invites={orgInvites}
        apiKeys={apiKeys}
        auditLog={auditLog}
        tokenUsage={tokenUsage}
        integrations={integrations}
        isAdmin={isAdmin}
        canAccess={canAccess}
        onSaveProfile={onSaveProfile}
        onUploadAvatar={onUploadAvatar}
        onSaveOrgProfile={onSaveOrgProfile}
        onSaveEmailSignature={onSaveEmailSignature}
        onUploadLogo={onUploadLogo}
        onSavePreferences={onSavePreferences}
        onInviteMember={onInviteMember}
        onRevokeMember={onRevokeMember}
        onUpdateMemberRole={onUpdateMemberRole}
        onRevokeInvite={onRevokeInvite}
        onGenerateApiKey={onGenerateApiKey}
        onRevokeApiKey={onRevokeApiKey}
        onDisconnectIntegration={onDisconnectIntegration}
      />
      </div>
    </div>
  );
}
