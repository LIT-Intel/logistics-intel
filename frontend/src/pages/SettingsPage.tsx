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

type JsonMap = Record<string, any>;

function normalizeError(error: any, fallback: string) {
  return error?.message || fallback;
}

function normalizePlanCode(value: string | null | undefined) {
  return String(value || "free_trial").trim().toLowerCase();
}

async function uploadAsset(file: File): Promise<{ file_url?: string; error?: string }> {
  try {
    if (typeof UploadFile !== "function") {
      return { error: "Upload service is not configured" };
    }

    const result = await UploadFile({ file });

    if (!result?.file_url) {
      return { error: "Upload failed" };
    }

    return { file_url: result.file_url };
  } catch (error: any) {
    return { error: normalizeError(error, "Upload failed") };
  }
}

export default function SettingsPage() {
  const { user, plan } = useAuth();

  const [profile, setProfile] = useState<JsonMap>({});
  const [orgProfile, setOrgProfile] = useState<JsonMap>({});
  const [preferences, setPreferences] = useState<JsonMap>({});

  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [orgInvites, setOrgInvites] = useState<any[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [subscription, setSubscription] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);

  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [tokenUsage, setTokenUsage] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);

  const [savedCount, setSavedCount] = useState(0);
  const [campaignCount, setCampaignCount] = useState(0);
  const [rfpCount, setRfpCount] = useState(0);

  const isSuperAdmin =
    ADMIN_EMAILS.includes(user?.email ?? "") ||
    user?.user_metadata?.role === "admin" ||
    user?.user_metadata?.role === "super_admin";

  const isOrgOwner = orgMembers.some(
    (m) =>
      m.user_id === user?.id &&
      ["owner", "admin", "super_admin"].includes(String(m.role || "").toLowerCase())
  );

  const isAdmin = isSuperAdmin || isOrgOwner;

  const canAccess = useCallback(
    (minPlan: string) =>
      isAdmin ||
      (PLAN_RANK[normalizePlanCode(plan)] ?? 0) >= (PLAN_RANK[normalizePlanCode(minPlan)] ?? 0),
    [isAdmin, plan]
  );

  const loadAll = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;

    const { data: userProfileData, error: userProfileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    if (userProfileError) console.error("[settings] user_profiles", userProfileError);

    const { data: baseProfileData, error: baseProfileError } = await supabase
      .from("profiles")
      .select("full_name, company_name, organization_name, avatar_url")
      .eq("id", uid)
      .maybeSingle();
    if (baseProfileError) console.error("[settings] profiles", baseProfileError);

    setProfile({
      name:
        userProfileData?.full_name ||
        baseProfileData?.full_name ||
        user?.user_metadata?.full_name ||
        "",
      title: userProfileData?.title || "",
      phone: userProfileData?.phone || "",
      location: userProfileData?.location || "",
      bio: userProfileData?.bio || "",
      avatar_url:
        userProfileData?.avatar_url ||
        baseProfileData?.avatar_url ||
        user?.user_metadata?.avatar_url ||
        "",
      email: user?.email || "",
      plan: isAdmin ? "admin" : normalizePlanCode(plan),
      isAdmin,
    });

    const { data: prefsData, error: prefsError } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    if (prefsError) console.error("[settings] user_preferences", prefsError);
    setPreferences(prefsData ?? {});

    let currentOrgId: string | null = null;

    const { data: membership, error: membershipError } = await supabase
      .from("org_members")
      .select("org_id, role, status")
      .eq("user_id", uid)
      .in("status", ["active", "pending", "invited"])
      .limit(1)
      .maybeSingle();
    if (membershipError) console.error("[settings] org_members membership", membershipError);

    currentOrgId = membership?.org_id ?? null;

    if (!currentOrgId) {
      const possibleNames = [
        baseProfileData?.organization_name,
        baseProfileData?.company_name,
        user?.user_metadata?.organization_name,
        user?.user_metadata?.company_name,
      ]
        .map((value: any) => String(value || "").trim())
        .filter(Boolean);

      if (possibleNames.length > 0) {
        const { data: fallbackOrg, error: fallbackOrgError } = await supabase
          .from("organizations")
          .select("*")
          .in("name", possibleNames)
          .limit(1)
          .maybeSingle();

        if (fallbackOrgError) {
          console.error("[settings] organizations fallback lookup", fallbackOrgError);
        } else if (fallbackOrg?.id) {
          currentOrgId = fallbackOrg.id;
        }
      }
    }

    setOrgId(currentOrgId);

    if (currentOrgId) {
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", currentOrgId)
        .maybeSingle();
      if (orgError) console.error("[settings] organizations", orgError);

      setOrgProfile({
        ...(orgData ?? {}),
        company: orgData?.name ?? orgData?.company ?? "",
        supportEmail: orgData?.support_email ?? orgData?.supportEmail ?? user?.email ?? "",
        address: orgData?.address ?? "",
        timezone: orgData?.timezone ?? "",
      });

      const { data: membersData, error: membersError } = await supabase
        .from("org_members")
        .select("id, user_id, role, status, created_at, email, full_name")
        .eq("org_id", currentOrgId)
        .order("created_at", { ascending: false });
      if (membersError) console.error("[settings] org_members list", membersError);
      setOrgMembers(membersData ?? []);

      const { data: invitesData, error: invitesError } = await supabase
        .from("org_invites")
        .select("id, email, role, status, created_at, expires_at")
        .eq("org_id", currentOrgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (invitesError) console.error("[settings] org_invites", invitesError);
      setOrgInvites(invitesData ?? []);
    } else {
      setOrgProfile({
        company:
          baseProfileData?.organization_name ||
          baseProfileData?.company_name ||
          user?.user_metadata?.organization_name ||
          user?.user_metadata?.company_name ||
          "",
        supportEmail: user?.email || "",
      });
      setOrgMembers([]);
      setOrgInvites([]);
    }

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

    if (subResult.status === "fulfilled") {
      if (subResult.value.error) console.error("[settings] subscriptions", subResult.value.error);
      setSubscription(subResult.value.data ?? null);
    }

    if (plansResult.status === "fulfilled") {
      if (plansResult.value.error) console.error("[settings] plans", plansResult.value.error);
      const rawPlans = plansResult.value.data ?? [];
      setPlans(rawPlans.map((p: any) => ({ ...p, plan_code: p.plan_code ?? p.code })));
    }

    const { data: keysData } = await supabase
      .from("api_keys")
      .select("id, key_name, key_prefix, last_used_at, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    setApiKeys(keysData ?? []);

    const { data: auditData } = await supabase
      .from("security_audit_log")
      .select("id, action, ip_address, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);
    setAuditLog(auditData ?? []);

    const { data: tokenData } = await supabase
      .from("token_ledger")
      .select("feature, tokens_used")
      .eq("user_id", uid);
    setTokenUsage(tokenData ?? []);

    const { data: intData } = await supabase
      .from("integrations")
      .select("id, integration_type, type, created_at")
      .eq("user_id", uid);
    setIntegrations(intData ?? []);

    const [savedRes, campRes, rfpRes] = await Promise.allSettled([
      supabase.from("saved_companies").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("lit_campaigns").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("lit_rfps").select("id", { count: "exact", head: true }).eq("user_id", uid),
    ]);

    if (savedRes.status === "fulfilled") setSavedCount(savedRes.value.count ?? 0);
    if (campRes.status === "fulfilled") setCampaignCount(campRes.value.count ?? 0);
    if (rfpRes.status === "fulfilled") setRfpCount(rfpRes.value.count ?? 0);
  }, [user?.id, user?.email, user?.user_metadata, plan, isAdmin]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onSaveProfile = async (
    data: Record<string, unknown>
  ): Promise<{ error?: string }> => {
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

    if (error) return { error: normalizeError(error, "Failed saving profile") };

    if (data.name) {
      await updateProfile({ full_name: String(data.name) }).catch((e) =>
        console.warn("[settings] updateProfile metadata failed", e)
      );
    }

    await loadAll();
    return {};
  };

  const onUploadAvatar = async (file: File): Promise<{ error?: string }> => {
    const uid = user?.id;
    if (!uid) return { error: "Not authenticated" };

    const uploaded = await uploadAsset(file);
    if (uploaded.error || !uploaded.file_url) {
      return { error: uploaded.error || "Avatar upload failed" };
    }

    const avatarUrl = uploaded.file_url;

    const { error: userProfileError } = await supabase
      .from("user_profiles")
      .upsert({ user_id: uid, avatar_url: avatarUrl }, { onConflict: "user_id" });
    if (userProfileError) return { error: normalizeError(userProfileError, "Failed saving avatar") };

    const { error: baseProfileError } = await supabase
      .from("profiles")
      .upsert({ id: uid, avatar_url: avatarUrl }, { onConflict: "id" });
    if (baseProfileError) return { error: normalizeError(baseProfileError, "Failed saving avatar") };

    await updateProfile({ avatar_url: avatarUrl }).catch((e) =>
      console.warn("[settings] avatar metadata update failed", e)
    );

    setProfile((prev) => ({ ...prev, avatar_url: avatarUrl }));
    await loadAll();
    return {};
  };

  const onSaveOrgProfile = async (
    data: Record<string, unknown>
  ): Promise<{ error?: string }> => {
    if (!orgId) {
      return {
        error: isSuperAdmin
          ? "No active organization is linked to this account yet"
          : "No organization found",
      };
    }

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

    const { error } = await supabase
      .from("organizations")
      .upsert(updates, { onConflict: "id" });

    if (error) return { error: normalizeError(error, "Failed saving organization") };

    setOrgProfile((prev) => ({
      ...prev,
      ...updates,
      company: updates.name ?? prev.company ?? "",
      supportEmail: updates.support_email ?? prev.supportEmail ?? "",
    }));

    await loadAll();
    return {};
  };

  const onSaveEmailSignature = async (
    signature: string
  ): Promise<{ error?: string }> => {
    const uid = user?.id;
    if (!uid) return { error: "Not authenticated" };

    const { data: existing } = await supabase
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", uid)
      .maybeSingle();

    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        {
          user_id: uid,
          email_signature: signature,
          preferences: existing?.preferences ?? preferences?.preferences ?? {},
        },
        { onConflict: "user_id" }
      );

    if (error) return { error: normalizeError(error, "Failed saving signature") };

    setPreferences((prev) => ({ ...prev, email_signature: signature }));
    await loadAll();
    return {};
  };

  const onUploadLogo = async (file: File): Promise<{ error?: string }> => {
    if (!orgId) {
      return {
        error: isSuperAdmin
          ? "No active organization is linked to this account yet"
          : "No organization found",
      };
    }

    const uploaded = await uploadAsset(file);
    if (uploaded.error || !uploaded.file_url) {
      return { error: uploaded.error || "Logo upload failed" };
    }

    const { error } = await supabase
      .from("organizations")
      .update({ logo_url: uploaded.file_url })
      .eq("id", orgId);

    if (error) return { error: normalizeError(error, "Failed saving company logo") };

    setOrgProfile((prev) => ({ ...prev, logo_url: uploaded.file_url }));
    await loadAll();
    return {};
  };

  const onSavePreferences = async (section: string, data: Record<string, unknown>) => {
    const uid = user?.id;
    if (!uid) return { error: "Not authenticated" };

    const { data: existing } = await supabase
      .from("user_preferences")
      .select("preferences, email_signature")
      .eq("user_id", uid)
      .maybeSingle();

    const merged = { ...(existing?.preferences ?? {}), [section]: data };
    const payload: JsonMap = { user_id: uid, preferences: merged };

    if (existing?.email_signature !== undefined) payload.email_signature = existing.email_signature;
    else if (preferences?.email_signature !== undefined) payload.email_signature = preferences.email_signature;

    const { error } = await supabase
      .from("user_preferences")
      .upsert(payload, { onConflict: "user_id" });

    if (error) return { error: normalizeError(error, `Failed saving ${section} preferences`) };

    setPreferences((prev: any) => ({ ...prev, preferences: merged }));
    return {};
  };

  const onInviteMember = async (email: string, role: string): Promise<{ error?: string }> => {
    if (!orgId) {
      return {
        error: isSuperAdmin
          ? "No active organization is linked to this account yet"
          : "No organization found",
      };
    }

    if (!email?.trim()) return { error: "Email is required" };

    const seatLimit = subscription?.seat_limit ?? null;
    if (
      typeof seatLimit === "number" &&
      seatLimit > 0 &&
      (orgMembers.length + orgInvites.length) >= seatLimit &&
      !isSuperAdmin
    ) {
      return { error: "Seat limit reached for this workspace plan" };
    }

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

    if (error) return { error: normalizeError(error, "Failed creating invite") };

    await loadAll();
    return {};
  };

  const onRevokeMember = async (memberId: string): Promise<{ error?: string }> => {
    const { error } = await supabase.from("org_members").delete().eq("id", memberId);
    if (error) return { error: normalizeError(error, "Failed revoking member") };
    setOrgMembers((prev) => prev.filter((m) => m.id !== memberId));
    return {};
  };

  const onUpdateMemberRole = async (memberId: string, role: string): Promise<{ error?: string }> => {
    const { error } = await supabase.from("org_members").update({ role }).eq("id", memberId);
    if (error) return { error: normalizeError(error, "Failed updating member role") };
    setOrgMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    return {};
  };

  const onRevokeInvite = async (inviteId: string): Promise<{ error?: string }> => {
    const { error } = await supabase.from("org_invites").delete().eq("id", inviteId);
    if (error) return { error: normalizeError(error, "Failed revoking invite") };
    setOrgInvites((prev) => prev.filter((i) => i.id !== inviteId));
    return {};
  };

  const onGenerateApiKey = async (keyName: string) => {
    const uid = user?.id;
    if (!uid) return null;

    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const hexKey = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const fullKey = `lit_${hexKey}`;
    const keyPrefix = fullKey.slice(0, 12);

    const encoder = new TextEncoder();
    const keyBuffer = encoder.encode(fullKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", keyBuffer);
    const keyHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        user_id: uid,
        key_name: keyName.trim(),
        key_prefix: keyPrefix,
        key_hash: keyHash,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[settings] api_keys insert", error);
      return null;
    }

    if (data?.id) await loadAll();
    return fullKey;
  };

  const onRevokeApiKey = async (keyId: string) => {
    const { error } = await supabase.from("api_keys").delete().eq("id", keyId);
    if (error) {
      console.error("[settings] api_keys delete", error);
      return;
    }
    setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
  };

  const onDisconnectIntegration = async (integrationId: string) => {
    const { error } = await supabase.from("integrations").delete().eq("id", integrationId);
    if (error) {
      console.error("[settings] integrations delete", error);
      return;
    }
    setIntegrations((prev) => prev.filter((i) => i.id !== integrationId));
  };

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
