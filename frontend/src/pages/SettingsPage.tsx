import React, { useEffect, useState, useCallback, useRef } from "react";
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

function requireNoError(
  error: { message?: string } | null | undefined,
  context: string
) {
  if (error) {
    throw new Error(`${context}: ${error.message ?? "Unknown error"}`);
  }
}

export default function SettingsPage() {
  const { user, plan } = useAuth();
  const mountedRef = useRef(true);

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

  const isAdminEmail =
    ADMIN_EMAILS.includes((user?.email ?? "").toLowerCase()) ||
    user?.user_metadata?.role === "admin" ||
    user?.user_metadata?.role === "super_admin";

  const currentMembership = orgMembers.find(
    (member) => member.user_id === user?.id && member.status === "active"
  );

  const currentOrgRole = normalizeOrgRole(
    currentMembership?.role,
    isAdminEmail ? "owner" : "member"
  );

  const isOrgOwner = currentOrgRole === "owner";
  const isOrgAdmin = currentOrgRole === "admin";
  const isAdmin = isAdminEmail || isOrgOwner || isOrgAdmin;
  const canManageMembers = isAdminEmail || isOrgOwner || isOrgAdmin;

  const canAccess = useCallback(
    (minPlan: string) =>
      isAdmin ||
      (PLAN_RANK[plan ?? "free_trial"] ?? 0) >= (PLAN_RANK[minPlan] ?? 0),
    [isAdmin, plan]
  );

  const safeSet = useCallback((setter: () => void) => {
    if (mountedRef.current) setter();
  }, []);

  const loadAll = useCallback(async () => {
    const uid = user?.id;

    if (!uid) {
      safeSet(() => {
        setProfile({});
        setOrgProfile({});
        setPreferences({});
        setOrgMembers([]);
        setOrgInvites([]);
        setOrgId(null);
        setSubscription(null);
        setPlans([]);
        setApiKeys([]);
        setAuditLog([]);
        setTokenUsage([]);
        setIntegrations([]);
        setSavedCount(0);
        setCampaignCount(0);
        setRfpCount(0);
      });
      return;
    }

    const { data: userProfileData, error: userProfileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    requireNoError(userProfileError, "Failed loading user profile");

    const { data: baseProfileData, error: baseProfileError } = await supabase
      .from("profiles")
      .select("id, full_name, company_name, organization_name, avatar_url")
      .eq("id", uid)
      .maybeSingle();
    requireNoError(baseProfileError, "Failed loading base profile");

    safeSet(() => {
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
        plan: plan ?? "free_trial",
        isAdmin,
      });
    });

    const { data: prefsData, error: prefsError } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    requireNoError(prefsError, "Failed loading user preferences");
    safeSet(() => setPreferences(prefsData ?? {}));

    const { data: membership, error: membershipError } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();
    requireNoError(membershipError, "Failed loading organization membership");

    const currentOrgId = membership?.org_id ?? null;
    safeSet(() => setOrgId(currentOrgId));

    if (currentOrgId) {
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", currentOrgId)
        .maybeSingle();
      requireNoError(orgError, "Failed loading organization");

      safeSet(() =>
        setOrgProfile({
          ...orgData,
          company: orgData?.name ?? orgData?.company ?? "",
          supportEmail: orgData?.support_email ?? orgData?.supportEmail ?? "",
          address: orgData?.address ?? "",
          timezone: orgData?.timezone ?? "",
        })
      );

      const { data: membersData, error: membersError } = await supabase
        .from("org_members")
        .select("id, org_id, user_id, role, status, joined_at, email, full_name")
        .eq("org_id", currentOrgId)
        .order("created_at", { ascending: false });
      requireNoError(membersError, "Failed loading organization members");
      safeSet(() => setOrgMembers(membersData ?? []));

      const { data: invitesData, error: invitesError } = await supabase
        .from("org_invites")
        .select("id, org_id, email, role, status, token, created_at, expires_at")
        .eq("org_id", currentOrgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      requireNoError(invitesError, "Failed loading organization invites");
      safeSet(() => setOrgInvites(invitesData ?? []));
    } else {
      safeSet(() => {
        setOrgProfile({});
        setOrgMembers([]);
        setOrgInvites([]);
      });
    }

    const [subResult, plansResult] = await Promise.allSettled([
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("plans")
        .select("*")
        .order("price_monthly", { ascending: true }),
    ]);

    if (subResult.status === "fulfilled") {
      requireNoError(subResult.value.error, "Failed loading subscription");
      safeSet(() => setSubscription(subResult.value.data ?? null));
    }

    if (plansResult.status === "fulfilled") {
      requireNoError(plansResult.value.error, "Failed loading plans");
      safeSet(() => setPlans(plansResult.value.data ?? []));
    }

    const { data: keysData, error: keysError } = await supabase
      .from("api_keys")
      .select("id, key_name, key_prefix, last_used_at, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    requireNoError(keysError, "Failed loading API keys");
    safeSet(() => setApiKeys(keysData ?? []));

    const { data: auditData, error: auditError } = await supabase
      .from("security_audit_log")
      .select("id, action, ip_address, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);
    requireNoError(auditError, "Failed loading audit log");
    safeSet(() => setAuditLog(auditData ?? []));

    const { data: tokenData, error: tokenError } = await supabase
      .from("token_ledger")
      .select("feature, tokens_used")
      .eq("user_id", uid);
    requireNoError(tokenError, "Failed loading token usage");
    safeSet(() => setTokenUsage(tokenData ?? []));

    const { data: intData, error: integrationsError } = await supabase
      .from("integrations")
      .select("id, integration_type, type, created_at")
      .eq("user_id", uid);
    requireNoError(integrationsError, "Failed loading integrations");
    safeSet(() => setIntegrations(intData ?? []));

    const [savedRes, campRes, rfpRes] = await Promise.allSettled([
      supabase
        .from("saved_companies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid),
      supabase
        .from("lit_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid),
      supabase
        .from("lit_rfps")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid),
    ]);

    if (savedRes.status === "fulfilled") {
      requireNoError(savedRes.value.error, "Failed loading saved count");
      safeSet(() => setSavedCount(savedRes.value.count ?? 0));
    }

    if (campRes.status === "fulfilled") {
      requireNoError(campRes.value.error, "Failed loading campaign count");
      safeSet(() => setCampaignCount(campRes.value.count ?? 0));
    }

    if (rfpRes.status === "fulfilled") {
      requireNoError(rfpRes.value.error, "Failed loading RFP count");
      safeSet(() => setRfpCount(rfpRes.value.count ?? 0));
    }
  }, [user?.id, user?.email, user?.user_metadata, plan, isAdmin, safeSet]);

  useEffect(() => {
    mountedRef.current = true;
    void loadAll();

    return () => {
      mountedRef.current = false;
    };
  }, [loadAll]);

  const onSaveProfile = async (data: Record<string, unknown>) => {
    const uid = user?.id;
    if (!uid) throw new Error("No authenticated user");

    const trimmedName =
      data.name !== undefined ? String(data.name || "").trim() || null : undefined;
    const trimmedTitle =
      data.title !== undefined ? String(data.title || "").trim() || null : undefined;
    const trimmedPhone =
      data.phone !== undefined ? String(data.phone || "").trim() || null : undefined;
    const trimmedLocation =
      data.location !== undefined ? String(data.location || "").trim() || null : undefined;
    const trimmedBio =
      data.bio !== undefined ? String(data.bio || "").trim() || null : undefined;

    const profileUpdates: JsonMap = { user_id: uid };
    if (trimmedName !== undefined) profileUpdates.full_name = trimmedName;
    if (trimmedTitle !== undefined) profileUpdates.title = trimmedTitle;
    if (trimmedPhone !== undefined) profileUpdates.phone = trimmedPhone;
    if (trimmedLocation !== undefined) profileUpdates.location = trimmedLocation;
    if (trimmedBio !== undefined) profileUpdates.bio = trimmedBio;

    const { error: userProfileError } = await supabase
      .from("user_profiles")
      .upsert(profileUpdates, { onConflict: "user_id" });
    requireNoError(userProfileError, "Failed saving user profile");

    if (trimmedName !== undefined) {
      const { error: baseProfileSaveError } = await supabase
        .from("profiles")
        .upsert({ id: uid, full_name: trimmedName }, { onConflict: "id" });
      requireNoError(baseProfileSaveError, "Failed saving base profile");
      await updateProfile({ full_name: trimmedName ?? "" });
    }

    setProfile((prev) => ({
      ...prev,
      ...(data.name !== undefined ? { name: trimmedName ?? "" } : {}),
      ...(data.title !== undefined ? { title: trimmedTitle ?? "" } : {}),
      ...(data.phone !== undefined ? { phone: trimmedPhone ?? "" } : {}),
      ...(data.location !== undefined ? { location: trimmedLocation ?? "" } : {}),
      ...(data.bio !== undefined ? { bio: trimmedBio ?? "" } : {}),
    }));

    await loadAll();
  };

  const onUploadAvatar = async (file: File) => {
    const uid = user?.id;
    if (!uid) throw new Error("No authenticated user");

    const result = await UploadFile({ file });
    if (!result?.file_url) throw new Error("Avatar upload failed");

    const avatarUrl = result.file_url;

    const { error: userProfileAvatarError } = await supabase
      .from("user_profiles")
      .upsert({ user_id: uid, avatar_url: avatarUrl }, { onConflict: "user_id" });
    requireNoError(userProfileAvatarError, "Failed saving avatar to user_profiles");

    const { error: baseProfileAvatarError } = await supabase
      .from("profiles")
      .upsert({ id: uid, avatar_url: avatarUrl }, { onConflict: "id" });
    requireNoError(baseProfileAvatarError, "Failed saving avatar to profiles");

    await updateProfile({ avatar_url: avatarUrl });
    setProfile((prev) => ({ ...prev, avatar_url: avatarUrl }));
  };

  const onSaveOrgProfile = async (data: Record<string, unknown>) => {
    if (!orgId) throw new Error("No organization found for this user");

    const updates: JsonMap = { id: orgId };
    if (data.company !== undefined) updates.name = String(data.company || "").trim() || null;
    if (data.tagline !== undefined) updates.tagline = String(data.tagline || "").trim() || null;
    if (data.website !== undefined) updates.website = String(data.website || "").trim() || null;
    if (data.logo_url !== undefined) updates.logo_url = data.logo_url || null;
    if (data.industry !== undefined) updates.industry = data.industry || null;
    if (data.size !== undefined) updates.size = data.size || null;
    if (data.supportEmail !== undefined) {
      updates.support_email = String(data.supportEmail || "").trim() || null;
    }
    if (data.address !== undefined) {
      updates.address = String(data.address || "").trim() || null;
    }
    if (data.timezone !== undefined) {
      updates.timezone = String(data.timezone || "").trim() || null;
    }

    const { error } = await supabase
      .from("organizations")
      .upsert(updates, { onConflict: "id" });
    requireNoError(error, "Failed saving organization profile");

    setOrgProfile((prev) => ({
      ...prev,
      ...updates,
      company: updates.name ?? prev.company ?? "",
      supportEmail: updates.support_email ?? prev.supportEmail ?? "",
    }));

    await loadAll();
  };

  const onSaveEmailSignature = async (
    signature: string
  ): Promise<{ error?: string }> => {
    const uid = user?.id;
    if (!uid) throw new Error("No authenticated user");

    const { data: existing, error: existingError } = await supabase
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", uid)
      .maybeSingle();
    requireNoError(existingError, "Failed loading existing preferences");

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
    requireNoError(error, "Failed saving email signature");

    setPreferences((prev) => ({ ...prev, email_signature: signature }));
    return {};
  };

  const onUploadLogo = async (file: File) => {
    if (!orgId) throw new Error("No organization found for this user");

    const result = await UploadFile({ file });
    if (!result?.file_url) throw new Error("Logo upload failed");

    const { error } = await supabase
      .from("organizations")
      .update({ logo_url: result.file_url })
      .eq("id", orgId);
    requireNoError(error, "Failed saving logo");

    setOrgProfile((prev) => ({ ...prev, logo_url: result.file_url }));
  };

  const onSavePreferences = async (section: string, data: Record<string, unknown>) => {
    const uid = user?.id;
    if (!uid) throw new Error("No authenticated user");

    const { data: existing, error: existingError } = await supabase
      .from("user_preferences")
      .select("preferences, email_signature")
      .eq("user_id", uid)
      .maybeSingle();
    requireNoError(existingError, "Failed loading existing preferences");

    const merged = {
      ...(existing?.preferences ?? {}),
      [section]: data,
    };

    const payload: JsonMap = {
      user_id: uid,
      preferences: merged,
    };

    if (existing?.email_signature !== undefined) {
      payload.email_signature = existing.email_signature;
    } else if (preferences?.email_signature !== undefined) {
      payload.email_signature = preferences.email_signature;
    }

    const { error } = await supabase
      .from("user_preferences")
      .upsert(payload, { onConflict: "user_id" });
    requireNoError(error, "Failed saving preferences");

    setPreferences((prev) => ({
      ...prev,
      preferences: merged,
    }));
  };

  const onInviteMember = async (email: string, role: string) => {
    if (!orgId) throw new Error("No organization found for this user");

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
    requireNoError(error, "Failed creating invite");

    await loadAll();
  };

  const onRevokeMember = async (memberId: string) => {
    const { error } = await supabase.from("org_members").delete().eq("id", memberId);
    requireNoError(error, "Failed revoking member");
    setOrgMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const onUpdateMemberRole = async (memberId: string, role: string) => {
    const { error } = await supabase
      .from("org_members")
      .update({ role })
      .eq("id", memberId);
    requireNoError(error, "Failed updating member role");

    setOrgMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role } : m))
    );
  };

  const onRevokeInvite = async (inviteId: string) => {
    const { error } = await supabase.from("org_invites").delete().eq("id", inviteId);
    requireNoError(error, "Failed revoking invite");
    setOrgInvites((prev) => prev.filter((i) => i.id !== inviteId));
  };

  const onGenerateApiKey = async (keyName: string) => {
    const uid = user?.id;
    if (!uid) throw new Error("No authenticated user");

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
    requireNoError(error, "Failed generating API key");

    if (data?.id) {
      setApiKeys((prev) => [
        {
          id: data.id,
          key_name: keyName.trim(),
          key_prefix: keyPrefix,
          last_used_at: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }

    return fullKey;
  };

  const onRevokeApiKey = async (keyId: string) => {
    const { error } = await supabase.from("api_keys").delete().eq("id", keyId);
    requireNoError(error, "Failed revoking API key");
    setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
  };

  const onDisconnectIntegration = async (integrationId: string) => {
    const { error } = await supabase
      .from("integrations")
      .delete()
      .eq("id", integrationId);
    requireNoError(error, "Failed disconnecting integration");
    setIntegrations((prev) => prev.filter((i) => i.id !== integrationId));
  };

  const profileWithStats = {
    ...profile,
    savedCount,
    campaignsCount: campaignCount,
    rfpsCount: rfpCount,
  };

  const effectiveSubscription = subscription ?? undefined;

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
