import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const hasStartedRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  const [message, setMessage] = useState("Checking invite...");

  useEffect(() => {
    let isCancelled = false;

    const acceptInvite = async () => {
      if (hasStartedRef.current) return;

      const token = (searchParams.get("token") || "").trim();
      const email = (searchParams.get("email") || "").trim().toLowerCase();

      if (!token) {
        setMessage("Invite token is missing.");
        window.setTimeout(() => {
          if (!isCancelled) navigate("/login", { replace: true });
        }, 1200);
        return;
      }

      if (!user?.id) {
        const signupParams = new URLSearchParams();
        signupParams.set("token", token);
        if (email) signupParams.set("email", email);
        navigate(`/signup?${signupParams.toString()}`, { replace: true });
        return;
      }

      hasStartedRef.current = true;
      setMessage("Accepting invite v2...");

      const { data, error } = await supabase.functions.invoke(
        "accept-workspace-invite",
        {
          body: {
            token,
            email,
            userId: user.id,
          },
        }
      );

      if (isCancelled) return;

      if (error) {
        hasStartedRef.current = false;
        setMessage(error.message || "Failed accepting invite.");
        return;
      }

      if (!data?.ok) {
        hasStartedRef.current = false;
        setMessage(data?.error || "Failed accepting invite.");
        return;
      }

      setMessage("Invite accepted. Redirecting...");
      window.setTimeout(() => {
        if (!isCancelled) {
          navigate("/app/dashboard", { replace: true });
        }
      }, 700);
    };

    retryTimerRef.current = window.setTimeout(() => {
      void acceptInvite();
    }, 300);

    return () => {
      isCancelled = true;
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
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
