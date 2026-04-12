import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { updateProfile } from "@/auth/supabaseAuthClient";
import { UploadFile } from "@/api/integrations";
import SettingsLayout from "@/components/settings/SettingsLayout";

const PLAN_RANK: Record<string, number> = {
  free_trial: 0,
  standard: 1,
  growth: 2,
  enterprise: 3,
};

const ORG_MEMBER_ROLES = ["owner", "admin", "member"] as const;

type OrgMemberRole = (typeof ORG_MEMBER_ROLES)[number];
type JsonMap = Record<string, any>;

function normalizeError(error: any, fallback: string) {
  return error?.message || fallback;
}

function toStringOrNull(value: unknown) {
  const next = String(value ?? "").trim();
  return next || null;
}

function normalizeOrgRole(value: unknown, fallback: OrgMemberRole = "member"): OrgMemberRole {
  const next = String(value ?? "").trim().toLowerCase();
  if (ORG_MEMBER_ROLES.includes(next as OrgMemberRole)) {
    return next as OrgMemberRole;
  }
  return fallback;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function buildAdminSubscription() {
  return {
    plan_code: "unlimited",
    status: "active",
    cancel_at_period_end: false,
    seat_limit: null,
    current_period_end: null,
    is_admin_override: true,
  };
}

function deriveOrgName(params: {
  explicitName?: string | null;
  fallbackOrgName?: string | null;
  email?: string | null;
}) {
  const explicit = toStringOrNull(params.explicitName);
  if (explicit) return explicit;

  const fallback = toStringOrNull(params.fallbackOrgName);
  if (fallback) return fallback;

  const email = (params.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return "My Workspace";

  const domain = email.split("@")[1] || "";
  const base = domain.split(".")[0] || "";
  if (!base) return "My Workspace";

  return base
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function uploadAsset(params: {
  file: File;
  folder: "avatars" | "logos";
  uid: string;
}): Promise<{ file_url?: string; error?: string }> {
  const { file, folder, uid } = params;

  try {
    if (typeof UploadFile === "function") {
      const result = await UploadFile({ file });

      if (result?.file_url) {
        return { file_url: result.file_url };
      }

      if (result?.error) {
        console.warn(
          `[settings] UploadFile ${folder} upload returned error, falling back to storage`,
          result.error
        );
      }
    }
  } catch (error) {
    console.warn(`[settings] UploadFile ${folder} upload failed, falling back to storage`, error);
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const safeExt = (ext || "bin").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
  const path = `${folder}/${uid}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;

  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(path, file, { upsert: true });

  if (uploadError) {
    return {
      error: normalizeError(uploadError, `Failed uploading ${folder.slice(0, -1)}`),
    };
  }

  const { data } = supabase.storage.from("assets").getPublicUrl(path);
  return { file_url: data?.publicUrl };
}

export default function SettingsPage() {
  const { user, plan, isSuperAdmin } = useAuth();

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

  const isAdminEmail = isSuperAdmin;

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
      isAdmin || (PLAN_RANK[plan ?? "free_trial"] ?? 0) >= (PLAN_RANK[minPlan] ?? 0),
    [isAdmin, plan]
  );

  const ensureOrgContext = useCallback(
    async (explicitOrgName?: string | null): Promise<{ orgId: string | null; error?: string }> => {
      if (orgId) return { orgId };

      if (!user?.id) {
        return { orgId: null, error: "Not authenticated" };
      }

      const fallbackOrgName =
        profile?.company_name ||
        user?.user_metadata?.organization_name ||
        user?.user_metadata?.company_name ||
        null;

      const companyName = deriveOrgName({
        explicitName: explicitOrgName || orgProfile?.company || orgProfile?.name || null,
        fallbackOrgName,
        email: user.email ?? null,
      });

      const { data: existingMembership, error: membershipError } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("org_id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (membershipError) {
        return {
          orgId: null,
          error: normalizeError(membershipError, "Failed checking organization membership"),
        };
      }

      if (existingMembership?.org_id) {
        setOrgId(existingMembership.org_id);
        return { orgId: existingMembership.org_id };
      }

      const { data: existingOrg, error: existingOrgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingOrgError) {
        return {
          orgId: null,
          error: normalizeError(existingOrgError, "Failed checking existing organization"),
        };
      }

      if (existingOrg?.id) {
        const membershipPayload = {
          org_id: existingOrg.id,
          user_id: user.id,
          email: user.email ?? null,
          full_name: user?.user_metadata?.full_name || profile?.name || null,
          role: "owner",
          status: "active",
        };

        const { error: membershipUpsertError } = await supabase
          .from("org_members")
          .upsert(membershipPayload, { onConflict: "org_id,user_id" });

        if (membershipUpsertError) {
          return {
            orgId: null,
            error: normalizeError(membershipUpsertError, "Failed linking organization membership"),
          };
        }

        setOrgId(existingOrg.id);
        setOrgProfile({
          ...(existingOrg ?? {}),
          company: existingOrg.name ?? companyName,
          name: existingOrg.name ?? companyName,
          supportEmail: existingOrg.support_email ?? user.email ?? "",
        });

        return { orgId: existingOrg.id };
      }

      const { data: createdOrg, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: companyName,
          owner_id: user.id,
          support_email: user.email ?? null,
          owner_email: user.email ?? null,
          timezone: "America/New_York",
        })
        .select("*")
        .single();

      if (orgError || !createdOrg?.id) {
        return { orgId: null, error: normalizeError(orgError, "Failed creating organization") };
      }

      const membershipPayload = {
        org_id: createdOrg.id,
        user_id: user.id,
        email: user.email ?? null,
        full_name: user?.user_metadata?.full_name || profile?.name || null,
        role: "owner",
        status: "active",
      };

      const { error: membershipUpsertError } = await supabase
        .from("org_members")
        .upsert(membershipPayload, { onConflict: "org_id,user_id" });

      if (membershipUpsertError) {
        return {
          orgId: null,
          error: normalizeError(membershipUpsertError, "Failed linking organization membership"),
        };
      }

      setOrgId(createdOrg.id);
      setOrgProfile({
        ...(createdOrg ?? {}),
        company: createdOrg.name ?? companyName,
        name: createdOrg.name ?? companyName,
        supportEmail: createdOrg.support_email ?? user.email ?? "",
      });

      return { orgId: createdOrg.id };
    },
    [
      orgId,
      user?.id,
      user?.email,
      user?.user_metadata,
      profile?.company_name,
      profile?.name,
      orgProfile?.company,
      orgProfile?.name,
    ]
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

    const fallbackOrgName =
      baseProfileData?.organization_name ||
      baseProfileData?.company_name ||
      user?.user_metadata?.organization_name ||
      user?.user_metadata?.company_name ||
      "";

    let currentOrgId: string | null = null;

    const { data: membership, error: membershipError } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) console.error("[settings] org_members membership", membershipError);
    currentOrgId = membership?.org_id ?? null;

    if (!currentOrgId && isAdminEmail) {
      const candidateNames = [
        fallbackOrgName,
        user?.user_metadata?.workspace_name,
        "Admin Console",
      ].filter(Boolean) as string[];

      for (const candidate of candidateNames) {
        const { data: adminOrg, error: adminOrgError } = await supabase
          .from("organizations")
          .select("*")
          .ilike("name", candidate)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (adminOrgError) {
          console.error("[settings] organizations admin fallback by name", adminOrgError);
        }

        if (adminOrg?.id) {
          currentOrgId = adminOrg.id;
          break;
        }
      }

      if (!currentOrgId && user?.email) {
        const { data: emailOrg, error: emailOrgError } = await supabase
          .from("organizations")
          .select("*")
          .or(`support_email.eq.${user.email},owner_email.eq.${user.email}`)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (emailOrgError) {
          console.error("[settings] organizations admin fallback by email", emailOrgError);
        }

        if (emailOrg?.id) currentOrgId = emailOrg.id;
      }
    }

    if (!currentOrgId && !isAdminEmail) {
      const bootstrap = await ensureOrgContext(fallbackOrgName || null);
      if (bootstrap.error) {
        console.error("[settings] org bootstrap", bootstrap.error);
      }
      currentOrgId = bootstrap.orgId ?? null;
    }

    let activeWorkspaceName = "Admin Console";

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
      company_name: activeWorkspaceName,
      plan: isAdmin ? "unlimited" : (plan ?? "free_trial"),
      isAdmin,
    });

    const { data: prefsData, error: prefsError } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    if (prefsError) console.error("[settings] user_preferences", prefsError);
    setPreferences(prefsData ?? {});

    setOrgId(currentOrgId);

    if (currentOrgId) {
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", currentOrgId)
        .maybeSingle();
      if (orgError) console.error("[settings] organizations", orgError);

      activeWorkspaceName = orgData?.name || fallbackOrgName || "Workspace";

      setOrgProfile({
        ...(orgData ?? {}),
        company: orgData?.name ?? orgData?.company ?? activeWorkspaceName ?? "",
        name: orgData?.name ?? activeWorkspaceName ?? "",
        supportEmail: orgData?.support_email ?? orgData?.supportEmail ?? user?.email ?? "",
        address: orgData?.address ?? "",
        timezone: orgData?.timezone ?? "",
      });

      const { data: membersData, error: membersError } = await supabase
        .from("org_members")
        .select("id, org_id, user_id, role, status, joined_at, email, full_name")
        .eq("org_id", currentOrgId)
        .eq("status", "active")
        .order("joined_at", { ascending: false });
      if (membersError) console.error("[settings] org_members list", membersError);
      setOrgMembers(
        (membersData ?? []).map((member: any) => ({
          ...member,
          role: normalizeOrgRole(member.role),
        }))
      );

      const { data: invitesData, error: invitesError } = await supabase
        .from("org_invites")
        .select("id, org_id, email, role, status, token, created_at, expires_at")
        .eq("org_id", currentOrgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (invitesError) console.error("[settings] org_invites", invitesError);
      setOrgInvites(
        (invitesData ?? []).map((invite: any) => ({
          ...invite,
          role: normalizeOrgRole(invite.role),
        }))
      );
    } else {
      setOrgProfile({
        id: null,
        name: "Admin Console",
        company: "Admin Console",
        supportEmail: user?.email ?? "",
        is_platform_admin_context: true,
      });
      setOrgMembers([]);
      setOrgInvites([]);
    }

    const [subResult, plansResult] = await Promise.allSettled([
      currentOrgId
        ? supabase
            .from("subscriptions")
            .select("*")
            .eq("org_id", currentOrgId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : supabase
            .from("subscriptions")
            .select("*")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
      supabase.from("plans").select("*").order("price_monthly", { ascending: true }),
    ]);

    if (plansResult.status === "fulfilled") {
      if (plansResult.value.error) console.error("[settings] plans", plansResult.value.error);
      const rawPlans = plansResult.value.data ?? [];
      setPlans(rawPlans.map((p: any) => ({ ...p, plan_code: p.plan_code ?? p.code })));
    }

    if (isAdmin) {
      setSubscription(buildAdminSubscription());
    } else if (subResult.status === "fulfilled") {
      if (subResult.value.error) console.error("[settings] subscriptions", subResult.value.error);
      setSubscription(subResult.value.data ?? null);
    } else {
      setSubscription(null);
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
  }, [user?.id, user?.email, user?.user_metadata, plan, isAdmin, isAdminEmail, ensureOrgContext]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onSaveProfile = async (
    data: Record<string, unknown>
  ): Promise<{ error?: string }> => {
    const uid = user?.id;
    if (!uid) return { error: "Not authenticated" };

    const { error: insertError } = await supabase
      .from("user_profiles")
      .insert({ user_id: uid })
      .select()
      .maybeSingle();

    if (
      insertError &&
      !String(insertError.message || "").toLowerCase().includes("duplicate") &&
      !String(insertError.message || "").toLowerCase().includes("unique")
    ) {
      return { error: normalizeError(insertError, "Failed initializing profile") };
    }

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.full_name = toStringOrNull(data.name);
    if (data.title !== undefined) updates.title = toStringOrNull(data.title);
    if (data.phone !== undefined) updates.phone = toStringOrNull(data.phone);
    if (data.location !== undefined) updates.location = toStringOrNull(data.location);
    if (data.bio !== undefined) updates.bio = toStringOrNull(data.bio);

    const { error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("user_id", uid);

    if (error) return { error: normalizeError(error, "Failed saving profile") };

    if (data.name) {
      await updateProfile({ full_name: String(data.name) }).catch((e) =>
        console.warn("[settings] updateProfile metadata failed", e)
      );
    }

    setProfile((prev) => ({
      ...prev,
      name: updates.full_name ?? prev.name ?? "",
      title: updates.title ?? prev.title ?? "",
      phone: updates.phone ?? prev.phone ?? "",
      location: updates.location ?? prev.location ?? "",
      bio: updates.bio ?? prev.bio ?? "",
    }));

    return {};
  };

  const onSaveOrgProfile = async (
    data: Record<string, unknown>
  ): Promise<{ error?: string }> => {
    const ensured = await ensureOrgContext(toStringOrNull(data.company) || null);
    if (!ensured.orgId) {
      return { error: ensured.error ?? "No active organization is linked to this account yet" };
    }

    const uid = user?.id;
    if (!uid) return { error: "Not authenticated" };

    const updates: Record<string, unknown> = {
      owner_id: uid,
    };

    if (data.company !== undefined) updates.name = toStringOrNull(data.company);
    if (data.tagline !== undefined) updates.tagline = toStringOrNull(data.tagline);
    if (data.website !== undefined) updates.website = toStringOrNull(data.website);
    if (data.logo_url !== undefined) updates.logo_url = data.logo_url || null;
    if (data.industry !== undefined) updates.industry = toStringOrNull(data.industry);
    if (data.size !== undefined) updates.size = toStringOrNull(data.size);
    if (data.supportEmail !== undefined) updates.support_email = toStringOrNull(data.supportEmail);
    if (data.address !== undefined) updates.address = toStringOrNull(data.address);
    if (data.timezone !== undefined) updates.timezone = toStringOrNull(data.timezone);

    const { error } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", ensured.orgId);

    if (error) return { error: normalizeError(error, "Failed saving organization") };

    setOrgProfile((prev) => ({
      ...prev,
      ...updates,
      company: updates.name ?? prev.company ?? "",
      name: updates.name ?? prev.name ?? "",
      supportEmail: updates.support_email ?? prev.supportEmail ?? "",
    }));

    setProfile((prev) => ({
      ...prev,
      company_name: updates.name ?? prev.company_name ?? "",
    }));

    return {};
  };

  const onUploadAvatar = async (file: File): Promise<{ error?: string }> => {
    const uid = user?.id;
    if (!uid) return { error: "Not authenticated" };

    const result = await uploadAsset({ file, folder: "avatars", uid });
    if (result.error) return { error: result.error };
    if (!result.file_url) return { error: "Avatar upload failed" };

    const avatarUrl = result.file_url;

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
    return {};
  };

  const onUploadLogo = async (file: File): Promise<{ error?: string }> => {
    const ensured = await ensureOrgContext();
    if (!ensured.orgId) {
      return { error: ensured.error ?? "No active organization is linked to this account yet" };
    }

    const result = await uploadAsset({ file, folder: "logos", uid: ensured.orgId });
    if (result.error) return { error: result.error };
    if (!result.file_url) return { error: "Logo upload failed" };

    const { error } = await supabase
      .from("organizations")
      .update({ logo_url: result.file_url })
      .eq("id", ensured.orgId);

    if (error) return { error: normalizeError(error, "Failed saving company logo") };

    setOrgProfile((prev) => ({ ...prev, logo_url: result.file_url }));
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

  const onInviteMember = async (
    email: string,
    role: string
  ): Promise<{ error?: string }> => {
    if (!canManageMembers) {
      return { error: "Only workspace admins can manage access." };
    }

    const ensured = await ensureOrgContext();
    if (!ensured.orgId) {
      return {
        error:
          ensured.error ?? "No active organization is linked to this account yet",
      };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedRole = normalizeOrgRole(role, "member");

    if (!isValidEmail(normalizedEmail)) {
      return { error: "Enter a valid email address." };
    }

    if (normalizedRole === "owner") {
      return { error: "Owner assignment is not available from this screen." };
    }

    if (normalizedEmail === (user?.email ?? "").trim().toLowerCase()) {
      return { error: "You are already part of this workspace." };
    }

    const existingMember = orgMembers.find(
      (member) => (member.email ?? "").trim().toLowerCase() === normalizedEmail
    );
    if (existingMember) {
      return { error: "That user is already an active member of this workspace." };
    }

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const token = crypto.randomUUID();

    const inviteUrl = `${window.location.origin}/accept-invite?token=${encodeURIComponent(
      token
    )}&email=${encodeURIComponent(normalizedEmail)}`;

    const { data: existingInvite, error: existingInviteError } = await supabase
      .from("org_invites")
      .select(
        "id, org_id, email, role, status, token, created_at, expires_at, email_sent_at"
      )
      .eq("org_id", ensured.orgId)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingInviteError) {
      return {
        error: normalizeError(
          existingInviteError,
          "Failed checking existing invite"
        ),
      };
    }

    let savedInvite: any = null;

    if (existingInvite?.id) {
      if (existingInvite.status === "pending") {
        return { error: "A pending invite already exists for that email address." };
      }

      const { data: updatedInvite, error: updateInviteError } = await supabase
        .from("org_invites")
        .update({
          role: normalizedRole,
          token,
          status: "pending",
          invited_by_user_id: user?.id ?? null,
          expires_at: expiresAt,
          email_sent_at: null,
        })
        .eq("id", existingInvite.id)
        .eq("org_id", ensured.orgId)
        .select(
          "id, org_id, email, role, status, token, created_at, expires_at, email_sent_at"
        )
        .single();

      if (updateInviteError) {
        return {
          error: normalizeError(updateInviteError, "Failed recreating invite"),
        };
      }

      savedInvite = updatedInvite;
    } else {
      const { data: createdInvite, error: createInviteError } = await supabase
        .from("org_invites")
        .insert({
          org_id: ensured.orgId,
          email: normalizedEmail,
          role: normalizedRole,
          token,
          status: "pending",
          invited_by_user_id: user?.id ?? null,
          expires_at: expiresAt,
        })
        .select(
          "id, org_id, email, role, status, token, created_at, expires_at, email_sent_at"
        )
        .single();

      if (createInviteError) {
        return {
          error: normalizeError(createInviteError, "Failed creating invite"),
        };
      }

      savedInvite = createdInvite;
    }

    const { error: sendInviteError } = await supabase.functions.invoke(
      "send-org-invite",
      {
        body: {
          inviteId: savedInvite.id,
          orgId: ensured.orgId,
          email: normalizedEmail,
          role: normalizedRole,
          token,
          inviteUrl,
        },
      }
    );

    if (sendInviteError) {
      return {
        error: normalizeError(sendInviteError, "Failed sending invite email"),
      };
    }

    const sentAt = new Date().toISOString();

    const { error: markInviteReadyError } = await supabase
      .from("org_invites")
      .update({
        email_sent_at: sentAt,
      })
      .eq("id", savedInvite.id)
      .eq("org_id", ensured.orgId);

    if (markInviteReadyError) {
      return {
        error: normalizeError(
          markInviteReadyError,
          "Invite was created but failed to finalize"
        ),
      };
    }

    setOrgInvites((prev) => [
      {
        id: savedInvite.id,
        email: normalizedEmail,
        role: normalizedRole,
        status: "pending",
        created_at: savedInvite.created_at ?? sentAt,
        expires_at: savedInvite.expires_at ?? expiresAt,
      },
      ...prev.filter(
        (invite) => (invite.email ?? "").trim().toLowerCase() !== normalizedEmail
      ),
    ]);

    void loadAll();

    return {};
  };

  const onRevokeMember = async (memberId: string): Promise<{ error?: string }> => {
    if (!canManageMembers) {
      return { error: "Only workspace admins can manage access." };
    }

    if (!orgId) {
      return { error: "No active organization is linked to this account yet." };
    }

    const member = orgMembers.find((entry) => entry.id === memberId);
    if (!member) {
      return { error: "Member not found." };
    }

    if (member.user_id === user?.id) {
      return { error: "You cannot remove your own access from this screen." };
    }

    const memberRole = normalizeOrgRole(member.role);

    if (memberRole === "owner") {
      return { error: "Owner removal is not available from this screen." };
    }

    const { error } = await supabase
      .from("org_members")
      .delete()
      .eq("id", memberId)
      .eq("org_id", orgId);

    if (error) return { error: normalizeError(error, "Failed removing member") };

    setOrgMembers((prev) => prev.filter((entry) => entry.id !== memberId));
    return {};
  };

  const onUpdateMemberRole = async (memberId: string, role: string): Promise<{ error?: string }> => {
    if (!canManageMembers) {
      return { error: "Only workspace admins can manage access." };
    }

    if (!orgId) {
      return { error: "No active organization is linked to this account yet." };
    }

    const member = orgMembers.find((entry) => entry.id === memberId);
    if (!member) {
      return { error: "Member not found." };
    }

    if (member.user_id === user?.id) {
      return { error: "You cannot change your own role from this screen." };
    }

    const nextRole = normalizeOrgRole(role, "member");
    const currentRole = normalizeOrgRole(member.role);

    if (currentRole === "owner" || nextRole === "owner") {
      return { error: "Owner role changes are not available from this screen." };
    }

    if (currentRole === nextRole) {
      return {};
    }

    const { error } = await supabase
      .from("org_members")
      .update({ role: nextRole })
      .eq("id", memberId)
      .eq("org_id", orgId);

    if (error) return { error: normalizeError(error, "Failed updating member role") };

    setOrgMembers((prev) =>
      prev.map((entry) => (entry.id === memberId ? { ...entry, role: nextRole } : entry))
    );
    return {};
  };

  const onRevokeInvite = async (inviteId: string): Promise<{ error?: string }> => {
    if (!canManageMembers) {
      return { error: "Only workspace admins can manage access." };
    }

    if (!orgId) {
      return { error: "No active organization is linked to this account yet." };
    }

    const { error } = await supabase
      .from("org_invites")
      .update({ status: "revoked" })
      .eq("id", inviteId)
      .eq("org_id", orgId);

    if (error) return { error: normalizeError(error, "Failed revoking invite") };

    setOrgInvites((prev) => prev.filter((entry) => entry.id !== inviteId));
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

  const effectiveSubscription = subscription ?? undefined;

  return (
    <div className="min-h-full bg-slate-100 p-4 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1600px]">
        <SettingsLayout
          profile={profileWithStats}
          orgProfile={orgProfile}
          preferences={preferences}
          subscription={effectiveSubscription}
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
