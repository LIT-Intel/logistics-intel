import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [message, setMessage] = useState("Checking invite...");
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    if (hasRun) return;

    const run = async () => {
      const token = (searchParams.get("token") || "").trim();
      const email = (searchParams.get("email") || "").trim().toLowerCase();

      if (!token) {
        setMessage("Invite token is missing.");
        setTimeout(() => navigate("/login", { replace: true }), 1200);
        return;
      }

      if (!user) {
        const signupParams = new URLSearchParams();
        signupParams.set("token", token);
        if (email) signupParams.set("email", email);
        navigate(`/signup?${signupParams.toString()}`, { replace: true });
        return;
      }

      setHasRun(true);
      setMessage("Accepting invite...");

      const { data, error } = await supabase.functions.invoke(
        "accept-workspace-invite",
        {
          body: {
            token,
            email,
          },
        }
      );

      if (error) {
        setMessage(error.message || "Failed accepting invite.");
        return;
      }

      if (!data?.ok) {
        setMessage(data?.error || "Failed accepting invite.");
        return;
      }

      setMessage("Invite accepted. Redirecting...");
      setTimeout(() => {
        navigate("/app/dashboard", { replace: true });
      }, 700);
    };

    void run();
  }, [hasRun, navigate, searchParams, user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
        <h1 className="mb-3 text-2xl font-semibold text-white">Workspace Invite</h1>
        <p className="text-sm text-slate-300">{message}</p>
      </div>
    </div>
  );
}
