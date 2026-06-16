import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

type ViewState =
  | { kind: "loading"; message: string }
  | { kind: "mismatch"; invitedEmail: string; currentEmail: string; token: string }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "already_member" }
  | { kind: "seat_limit"; used?: number; limit?: number }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const hasStartedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);

  const [view, setView] = useState<ViewState>({ kind: "loading", message: "Checking invite..." });

  useEffect(() => {
    let isCancelled = false;

    const acceptInvite = async () => {
      if (hasStartedRef.current) return;

      const token = (searchParams.get("token") || "").trim();
      const email = (searchParams.get("email") || "").trim().toLowerCase();

      if (!token) {
        setView({ kind: "error", message: "Invite token is missing." });
        window.setTimeout(() => {
          if (!isCancelled) navigate("/login", { replace: true });
        }, 1500);
        return;
      }

      // If user context not populated yet, check if a session exists before bouncing to signup
      if (!user?.id) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          // Session exists but context hasn't propagated — wait up to ~3s then retry
          if (retryCountRef.current < 10) {
            retryCountRef.current += 1;
            retryTimerRef.current = window.setTimeout(() => {
              void acceptInvite();
            }, 300);
            return;
          }
        }
        // No session at all — send to signup
        const signupParams = new URLSearchParams();
        signupParams.set("token", token);
        if (email) signupParams.set("email", email);
        navigate(`/signup?${signupParams.toString()}`, { replace: true });
        return;
      }

      // Client-side email match short-circuit: detect "wrong account is signed in"
      // BEFORE calling the edge fn so we can render a helpful sign-out CTA
      // instead of a generic 403. Keeps the server-side check as the security
      // boundary; this is purely UX.
      const currentEmail = String(user.email || "").toLowerCase();
      if (email && currentEmail && email !== currentEmail) {
        setView({ kind: "mismatch", invitedEmail: email, currentEmail, token });
        return;
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setView({ kind: "error", message: sessionError.message || "Failed loading session." });
        return;
      }

      if (!session?.access_token) {
        setView({ kind: "loading", message: "Waiting for authenticated session..." });
        retryTimerRef.current = window.setTimeout(() => {
          void acceptInvite();
        }, 500);
        return;
      }

      hasStartedRef.current = true;
      setView({ kind: "loading", message: "Accepting invite..." });

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
          // Map structured error codes to specific user-facing states so
          // every failure has an actionable affordance (not a dead toast).
          const code = String(result?.code || "").toUpperCase();
          if (code === "INVITE_EMAIL_MISMATCH") {
            setView({
              kind: "mismatch",
              invitedEmail: email || String(result?.email || "").toLowerCase(),
              currentEmail,
              token,
            });
            return;
          }
          if (code === "INVITE_EXPIRED") {
            setView({ kind: "expired" });
            return;
          }
          if (code === "INVITE_ALREADY_USED") {
            setView({ kind: "already_member" });
            return;
          }
          if (code === "SEAT_LIMIT_EXCEEDED") {
            setView({ kind: "seat_limit", used: result?.used, limit: result?.limit });
            return;
          }
          if (code === "INVITE_NOT_FOUND") {
            setView({ kind: "not_found" });
            return;
          }
          setView({
            kind: "error",
            message: result?.error || `Invite acceptance failed with status ${response.status}.`,
          });
          return;
        }

        if (!result?.ok) {
          hasStartedRef.current = false;
          setView({ kind: "error", message: result?.error || "Failed accepting invite." });
          return;
        }

        // Ensure a profiles row exists for this user (safe no-op if already present)
        await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              email: user.email,
              full_name:
                user.user_metadata?.full_name ||
                user.user_metadata?.display_name ||
                null,
            },
            { onConflict: "id", ignoreDuplicates: true }
          )
          .select("id")
          .maybeSingle();

        // Accepting an invite IS the onboarding for this user — they joined
        // an existing workspace, no wizard needed. Mark complete so RequireAuth
        // doesn't bounce them to /onboarding on the next navigation.
        if (user.user_metadata?.onboarding_completed !== true) {
          await supabase.auth.updateUser({ data: { onboarding_completed: true } });
        }

        setView({ kind: "loading", message: "Invite accepted. Redirecting..." });
        window.setTimeout(() => {
          if (!isCancelled) {
            navigate("/app/dashboard", { replace: true });
          }
        }, 700);
      } catch (error) {
        hasStartedRef.current = false;
        setView({
          kind: "error",
          message: error instanceof Error ? error.message : "Failed accepting invite.",
        });
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

  const handleSignOutAndAccept = async (invitedEmail: string, token: string) => {
    await supabase.auth.signOut();
    const params = new URLSearchParams();
    params.set("token", token);
    if (invitedEmail) params.set("email", invitedEmail);
    // After sign-out, route to signup so the invitee can create their account
    // (or the social-login button on signup will route to login if the
    // account already exists).
    navigate(`/signup?${params.toString()}`, { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
        <h1 className="mb-3 text-2xl font-semibold text-white">Workspace Invite</h1>

        {view.kind === "loading" && (
          <p className="text-sm text-slate-300">{view.message}</p>
        )}

        {view.kind === "mismatch" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              This invite was sent to <strong className="text-white">{view.invitedEmail}</strong>,
              but you&rsquo;re currently signed in as{" "}
              <strong className="text-white">{view.currentEmail}</strong>.
            </p>
            <button
              type="button"
              onClick={() => handleSignOutAndAccept(view.invitedEmail, view.token)}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Sign out and accept as {view.invitedEmail}
            </button>
            <button
              type="button"
              onClick={() => navigate("/app/dashboard", { replace: true })}
              className="w-full rounded-xl border border-slate-700 bg-transparent px-4 py-2 text-xs font-medium text-slate-400 transition hover:bg-slate-800"
            >
              Stay signed in as {view.currentEmail}
            </button>
          </div>
        )}

        {view.kind === "expired" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              This invite has expired. Ask the workspace admin to send a new one.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Back to sign in
            </button>
          </div>
        )}

        {view.kind === "revoked" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              This invite has been revoked. Contact the workspace admin to request a new one.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Back to sign in
            </button>
          </div>
        )}

        {view.kind === "already_member" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              You&rsquo;re already a member of this workspace.
            </p>
            <button
              type="button"
              onClick={() => navigate("/app/dashboard", { replace: true })}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Go to dashboard
            </button>
          </div>
        )}

        {view.kind === "seat_limit" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              This workspace is at its seat limit
              {view.used != null && view.limit != null ? ` (${view.used}/${view.limit})` : ""}.
              The workspace owner needs to add seats before you can join.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Back to sign in
            </button>
          </div>
        )}

        {view.kind === "not_found" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              This invite link is invalid. Double-check the URL or ask the workspace admin to send a new invite.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Back to sign in
            </button>
          </div>
        )}

        {view.kind === "error" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">{view.message}</p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
