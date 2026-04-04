import React, { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import SettingsLayout from "@/components/settings/SettingsLayout";

export default function SettingsPage() {
  const { user, plan } = useAuth();

  const [isSaving, setIsSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);

  const loadSettingsData = async (userId?: string) => {
    const targetUserId = userId ?? user?.id;
    if (!targetUserId) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, company_name")
      .eq("id", targetUserId)
      .maybeSingle();

    setFullName((profileData as any)?.full_name || user?.user_metadata?.full_name || "");
    setWorkEmail(user?.email || "");
  };

  const loadOrgMembers = async (userId?: string) => {
    const targetUserId = userId ?? user?.id;
    if (!targetUserId) return;

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
          .select("id, user_id, role, created_at")
          .eq("org_id", membershipData.org_id)
          .order("created_at", { ascending: false });

        const allMembers = [...(members || [])];

        const { data: invites } = await supabase
          .from("org_invites")
          .select("id, email, role, status, created_at")
          .eq("org_id", membershipData.org_id)
          .order("created_at", { ascending: false });

        if (invites && invites.length > 0) {
          const inviteMembers = invites.map((inv: any) => ({
            id: inv.id,
            email: inv.email,
            role: inv.role,
            status: "pending",
            created_at: inv.created_at,
          }));
          allMembers.unshift(...inviteMembers);
        }

        setOrgMembers(allMembers);
      }
    } catch (err) {
      console.error("[Settings] Failed to load org members:", err);
    }
  };

  const loadSubscription = async (userId?: string) => {
    const targetUserId = userId ?? user?.id;
    if (!targetUserId) return;

    const { data } = await (supabase as any)
      .from("subscriptions")
      .select("*")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setSubscription(data || null);
  };

  useEffect(() => {
    void loadSettingsData();
    void loadOrgMembers();
    void loadSubscription();
  }, [user?.id]);

  const onSaveProfile = async (data: Record<string, unknown>) => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (data.name !== undefined) updates.full_name = String(data.name || "").trim() || null;
      if (data.title !== undefined) updates.title = String(data.title || "").trim() || null;
      if (data.phone !== undefined) updates.phone = String(data.phone || "").trim() || null;
      if (data.location !== undefined) updates.location = String(data.location || "").trim() || null;
      if (data.bio !== undefined) updates.bio = String(data.bio || "").trim() || null;

      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, ...updates }, { onConflict: "id" });

      if (error) throw error;
      await loadSettingsData(user.id);
    } catch (err) {
      console.error("[Settings] Profile save failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const profileData = {
    name: fullName,
    email: workEmail,
    planName: plan
      ? String(plan).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Free Trial",
  };

  return (
    <div className="w-full px-6 py-6">
      <SettingsLayout
        profile={profileData}
        subscription={subscription ?? undefined}
        members={orgMembers}
        onSaveProfile={onSaveProfile}
        onInviteMember={() => setShowInviteModal(true)}
      />
    </div>
  );
}
