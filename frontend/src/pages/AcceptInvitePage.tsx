import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock, User as UserIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

// ─────────────────────────────────────────────────────────────────────────────
// AcceptInvitePage — single-step, dedicated invite acceptance flow.
//
// This page deliberately does NOT redirect to /signup or trigger Supabase's
// email-confirmation flow. The regular signup flow is untouched. An invited
// user lands here, fills in name + password, and goes straight to the app.
//
// View states:
//   loading        → background work (initial check, accepting, signing up)
//   form           → not logged in + token present: name + password form
//   mismatch       → logged in as wrong email vs the invited address
//   user_exists    → signup-with-invite returned USER_EXISTS — offer sign-in
//   not_found      → invalid token
//   expired        → invite past expiry
//   revoked        → invite was revoked
//   already_member → user already in the workspace
//   seat_limit     → workspace at seat cap
//   missing_token  → URL has no token param
//   error          → catch-all
// ─────────────────────────────────────────────────────────────────────────────

type ViewState =
  | { kind: "loading"; message: string }
  | { kind: "form" }
  | { kind: "mismatch"; invitedEmail: string; currentEmail: string; token: string }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "already_member" }
  | { kind: "seat_limit"; used?: number; limit?: number }
  | { kind: "not_found" }
  | { kind: "user_exists"; email: string; token: string }
  | { kind: "missing_token" }
  | { kind: "error"; message: string };

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const acceptStartedRef = useRef(false);
  const retryCountRef = useRef(0);

  const token = (searchParams.get("token") || "").trim();
  const email = (searchParams.get("email") || "").trim().toLowerCase();

  const [view, setView] = useState<ViewState>({ kind: "loading", message: "Checking invite..." });

  // Form state for the signup-with-invite flow (State 3)
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ─── Effect: pick a view based on auth + token state ────────────────────────
  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setView({ kind: "missing_token" });
      return;
    }

    const decide = async () => {
      // Not logged in (per AuthProvider). Double-check the session in case the
      // context hasn't propagated yet (brief race after OAuth callback).
      if (!user?.id) {
        const { data: sessionData } = await supabase.auth.getSession();
        const liveUser = sessionData?.session?.user;
        if (liveUser) {
          // Wait up to ~3s for AuthProvider to catch up before showing the form
          if (retryCountRef.current < 10) {
            retryCountRef.current += 1;
            window.setTimeout(() => {
              if (!cancelled) void decide();
            }, 300);
            return;
          }
        }
        // Show the dedicated invite signup form.
        if (!cancelled) setView({ kind: "form" });
        return;
      }

      // Logged in. Compare against invited email.
      const currentEmail = String(user.email || "").toLowerCase();
      if (email && currentEmail && email !== currentEmail) {
        if (!cancelled) setView({ kind: "mismatch", invitedEmail: email, currentEmail, token });
        return;
      }

      // Email matches (or no email param) — call accept-workspace-invite.
      if (acceptStartedRef.current) return;
      acceptStartedRef.current = true;
      if (!cancelled) setView({ kind: "loading", message: "Joining workspace..." });

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (!cancelled) setView({ kind: "error", message: "Session expired. Please sign in again." });
        return;
      }

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error("Supabase environment variables are missing.");
        }

        const response = await fetch(`${supabaseUrl}/functions/v1/accept-workspace-invite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({ token, email, userId: user.id }),
        });

        const result = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok || !result?.ok) {
          mapErrorToView(result, response.status, currentEmail, email, token, setView);
          return;
        }

        // Mark onboarding complete server-side — invitees skip the wizard.
        if (user.user_metadata?.onboarding_completed !== true) {
          await supabase.auth.updateUser({ data: { onboarding_completed: true } });
        }
        await supabase.auth.refreshSession();

        if (!cancelled) setView({ kind: "loading", message: "Invite accepted. Redirecting..." });
        window.setTimeout(() => {
          if (!cancelled) navigate("/app/dashboard", { replace: true });
        }, 600);
      } catch (err) {
        if (!cancelled) {
          setView({
            kind: "error",
            message: err instanceof Error ? err.message : "Failed accepting invite.",
          });
        }
      }
    };

    void decide();

    return () => {
      cancelled = true;
    };
  }, [token, email, user, navigate]);

  // ─── State 3 submit: create account via signup-with-invite edge fn ──────────
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim()) {
      setFormError("Please enter your full name.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Supabase environment variables are missing.");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/signup-with-invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          token,
          email,
          full_name: fullName.trim(),
          password,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.ok) {
        const code = String(result?.code || "").toUpperCase();
        if (code === "USER_EXISTS") {
          setView({ kind: "user_exists", email, token });
          return;
        }
        if (code === "INVITE_NOT_FOUND") {
          setView({ kind: "not_found" });
          return;
        }
        if (code === "INVITE_EXPIRED") {
          setView({ kind: "expired" });
          return;
        }
        if (code === "INVITE_EMAIL_MISMATCH") {
          setFormError("Email doesn't match the invite. Contact the workspace admin.");
          return;
        }
        if (code === "SEAT_LIMIT_EXCEEDED") {
          setView({ kind: "seat_limit", used: result?.used, limit: result?.limit });
          return;
        }
        setFormError(result?.error || `Signup failed (status ${response.status}).`);
        return;
      }

      // Persist the session returned by the edge fn so AuthProvider picks it up.
      if (result?.session?.access_token && result?.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
      }

      setView({ kind: "loading", message: "Welcome aboard. Redirecting..." });
      window.setTimeout(() => {
        navigate("/app/dashboard", { replace: true });
      }, 600);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed creating your account.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOutAndAccept = async (invitedEmail: string, currentToken: string) => {
    await supabase.auth.signOut();
    const params = new URLSearchParams();
    params.set("token", currentToken);
    if (invitedEmail) params.set("email", invitedEmail);
    // Reload back into THIS page (not /signup) so the user gets the dedicated
    // invite form instead of the standard signup wizard.
    window.location.assign(`/accept-invite?${params.toString()}`);
  };

  const formValid = fullName.trim().length > 0 && password.length >= 8;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        {view.kind === "loading" && (
          <div className="text-center">
            <h1 className="mb-3 text-2xl font-semibold text-white">Workspace Invite</h1>
            <p className="text-sm text-slate-300">{view.message}</p>
          </div>
        )}

        {view.kind === "form" && (
          <div>
            <h1 className="mb-2 text-2xl font-semibold text-white">Accept your invite</h1>
            <p className="mb-6 text-sm text-slate-400">
              Create your account to join the workspace.
            </p>

            {formError && (
              <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email — locked to invite address */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">Email</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    readOnly
                    aria-readonly
                    className="w-full cursor-not-allowed rounded-xl border border-slate-700 bg-slate-800/60 py-3 pl-10 pr-10 text-sm text-slate-200 outline-none"
                  />
                  <Lock className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                </div>
              </label>

              {/* Full name */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">Full name</span>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={submitting}
                    placeholder="Jane Doe"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/60 py-3 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20 disabled:opacity-60"
                  />
                </div>
              </label>

              {/* Password */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">
                  Password <span className="text-slate-500">(8+ characters)</span>
                </span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                    placeholder="••••••••"
                    minLength={8}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/60 py-3 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20 disabled:opacity-60"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={!formValid || submitting}
                className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Creating your account..." : "Accept and join workspace"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-slate-500">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set(
                    "next",
                    `/accept-invite?token=${token}${email ? `&email=${encodeURIComponent(email)}` : ""}`,
                  );
                  navigate(`/login?${params.toString()}`);
                }}
                className="font-medium text-indigo-400 hover:text-indigo-300"
              >
                Sign in
              </button>
            </p>
          </div>
        )}

        {view.kind === "mismatch" && (
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold text-white">Workspace Invite</h1>
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

        {view.kind === "user_exists" && (
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold text-white">Account already exists</h1>
            <p className="text-sm text-slate-300">
              An account already exists for <strong className="text-white">{view.email}</strong>.
              Sign in to accept the invite.
            </p>
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                params.set(
                  "next",
                  `/accept-invite?token=${view.token}&email=${encodeURIComponent(view.email)}`,
                );
                navigate(`/login?${params.toString()}`);
              }}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Sign in instead
            </button>
          </div>
        )}

        {view.kind === "expired" && (
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold text-white">Invite expired</h1>
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
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold text-white">Invite revoked</h1>
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
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold text-white">Welcome back</h1>
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
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold text-white">Workspace is full</h1>
            <p className="text-sm text-slate-300">
              This workspace is at its seat limit
              {view.used != null && view.limit != null ? ` (${view.used}/${view.limit})` : ""}.
              The owner needs to add seats before you can join.
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
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold text-white">Invalid invite</h1>
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

        {view.kind === "missing_token" && (
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold text-white">No invite token</h1>
            <p className="text-sm text-slate-300">
              We couldn&rsquo;t find an invite token in this URL.
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
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold text-white">Something went wrong</h1>
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

// ─── Helpers ────────────────────────────────────────────────────────────────
function mapErrorToView(
  result: any,
  status: number,
  currentEmail: string,
  invitedEmail: string,
  token: string,
  setView: (v: ViewState) => void,
) {
  const code = String(result?.code || "").toUpperCase();
  if (code === "INVITE_EMAIL_MISMATCH") {
    setView({
      kind: "mismatch",
      invitedEmail: invitedEmail || String(result?.email || "").toLowerCase(),
      currentEmail,
      token,
    });
    return;
  }
  if (code === "INVITE_EXPIRED") return setView({ kind: "expired" });
  if (code === "INVITE_REVOKED") return setView({ kind: "revoked" });
  if (code === "INVITE_ALREADY_USED") return setView({ kind: "already_member" });
  if (code === "SEAT_LIMIT_EXCEEDED")
    return setView({ kind: "seat_limit", used: result?.used, limit: result?.limit });
  if (code === "INVITE_NOT_FOUND") return setView({ kind: "not_found" });
  setView({
    kind: "error",
    message: result?.error || `Invite acceptance failed (status ${status}).`,
  });
}
