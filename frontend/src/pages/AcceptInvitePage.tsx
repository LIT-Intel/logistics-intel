import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [message, setMessage] = useState("Checking invite...");

  useEffect(() => {
    const run = async () => {
      const token = searchParams.get("token");
      const email = (searchParams.get("email") || "").trim().toLowerCase();

      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      if (!user) {
        const signupParams = new URLSearchParams();
        signupParams.set("token", token);
        if (email) signupParams.set("email", email);
        navigate(`/signup?${signupParams.toString()}`, { replace: true });
        return;
      }

      const currentEmail = (user.email || "").trim().toLowerCase();

      const { data: invite, error: inviteError } = await supabase
        .from("org_invites")
        .select("id, org_id, email, role, status, expires_at, token")
        .eq("token", token)
        .maybeSingle();

      if (inviteError || !invite) {
        setMessage("Invite not found or no longer valid.");
        return;
      }

      if (invite.status !== "pending") {
        setMessage("This invite has already been used.");
        setTimeout(() => navigate("/app/dashboard", { replace: true }), 1200);
        return;
      }

      if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
        setMessage("This invite has expired.");
        return;
      }

      const inviteEmail = (invite.email || "").trim().toLowerCase();

      if (inviteEmail && currentEmail && inviteEmail !== currentEmail) {
        setMessage("This invite belongs to a different email address.");
        return;
      }

      const { data: existingMember, error: existingMemberError } = await supabase
        .from("org_members")
        .select("id")
        .eq("org_id", invite.org_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingMemberError) {
        setMessage(existingMemberError.message || "Failed checking workspace membership.");
        return;
      }

      if (!existingMember?.id) {
        const { error: memberInsertError } = await supabase.from("org_members").insert({
          org_id: invite.org_id,
          user_id: user.id,
          email: user.email ?? invite.email,
          role: invite.role,
          status: "active",
        });

        if (memberInsertError) {
          setMessage(memberInsertError.message || "Failed adding you to the workspace.");
          return;
        }
      }

      const { error: inviteUpdateError } = await supabase
        .from("org_invites")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invite.id);

      if (inviteUpdateError) {
        setMessage(inviteUpdateError.message || "Joined workspace, but failed updating invite.");
        return;
      }

      setMessage("Invite accepted. Redirecting...");
      setTimeout(() => navigate("/app/dashboard", { replace: true }), 700);
    };

    void run();
  }, [navigate, searchParams, user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
        <h1 className="mb-3 text-2xl font-semibold text-white">Workspace Invite</h1>
        <p className="text-sm text-slate-300">{message}</p>
      </div>
    </div>
  );
}
