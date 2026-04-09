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

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setMessage(sessionError.message || "Failed loading session.");
        return;
      }

      if (!session?.access_token) {
        setMessage("Waiting for authenticated session...");
        retryTimerRef.current = window.setTimeout(() => {
          void acceptInvite();
        }, 500);
        return;
      }

      hasStartedRef.current = true;
      setMessage("Accepting invite v3...");

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error("Supabase environment variables are missing.");
        }

        const response = await fetch(
          `${supabaseUrl}/functions/v1/accept-workspace-invite`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: supabaseAnonKey,
            },
            body: JSON.stringify({
              token,
              email,
              userId: user.id,
            }),
          }
        );

        const result = await response.json().catch(() => ({}));

        if (isCancelled) return;

        if (!response.ok) {
          hasStartedRef.current = false;
          setMessage(
            result?.error ||
              `Invite acceptance failed with status ${response.status}.`
          );
          return;
        }

        if (!result?.ok) {
          hasStartedRef.current = false;
          setMessage(result?.error || "Failed accepting invite.");
          return;
        }

        setMessage("Invite accepted. Redirecting...");
        window.setTimeout(() => {
          if (!isCancelled) {
            navigate("/app/dashboard", { replace: true });
          }
        }, 700);
      } catch (error) {
        hasStartedRef.current = false;
        setMessage(
          error instanceof Error ? error.message : "Failed accepting invite."
        );
      }
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
