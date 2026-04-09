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
      const token = String(searchParams.get("token") || "").trim();
      const email = String(searchParams.get("email") || "").trim().toLowerCase();

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

      setMessage("Accepting invite...");

      const { data, error } = await supabase.functions.invoke("accept-workspace-invite", {
        body: {
          token,
          email,
        },
      });

      if (error) {
        setMessage(error.message || "Failed to accept invite.");
        return;
      }

      if (data?.error) {
        setMessage(String(data.error));
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
