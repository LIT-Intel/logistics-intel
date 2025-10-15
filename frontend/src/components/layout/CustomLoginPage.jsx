// frontend/src/components/layout/CustomLoginPage.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loginWithGoogle, loginWithMicrosoft, loginWithEmailPassword } from "@/auth/firebaseClient"; // ✅ ensure this line exists
import { useAuth } from "@/auth/AuthProvider";

export default function CustomLoginPage({ onClose }) {
  const nav = useNavigate();
  const { user } = useAuth?.() || { user: null };
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const welcomeName = useMemo(() => {
    const nameFromUser = user?.displayName || user?.email?.split("@")[0];
    try {
      const cached = JSON.parse(localStorage.getItem("lit:user") || "null");
      const cachedName = cached?.name || cached?.displayName || cached?.email?.split("@")[0];
      return nameFromUser || cachedName || null;
    } catch {
      return nameFromUser || null;
    }
  }, [user]);

  async function handleGoogle() {
    try {
      setErr("");
      await loginWithGoogle();
      nav("/app/dashboard");
    } catch (e) {
      setErr(e?.message || "Google sign-in failed");
    }
  }

  async function handleMicrosoft() {
    try {
      setErr("");
      await loginWithMicrosoft();
      nav("/app/dashboard");
    } catch (e) {
      setErr(e?.message || "Microsoft sign-in failed");
    }
  }

  async function handleEmailPassword(e) {
    e?.preventDefault?.();
    try {
      setErr("");
      setLoading(true);
      await loginWithEmailPassword(email, password);
      nav("/app/dashboard");
    } catch (e) {
      setErr(e?.message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center" style={{ background: 'linear-gradient(135deg, #0E1224 0%, #121835 60%, #161E43 100%)' }}>
      <div className="flex w-full max-w-5xl mx-auto rounded-2xl overflow-hidden shadow-xl border border-[var(--lit-border)] bg-white/95 backdrop-blur min-h-[560px]">
        <div className="hidden md:flex w-1/2 bg-[var(--lit-panel-2)] text-white p-8 items-end relative">
        <div className="absolute top-6 left-6 flex items-center gap-2">
          <img
            src="/favicon.svg"
            alt="LIT"
            className="w-8 h-8 rounded"
          />
          <span className="font-semibold tracking-tight">LIT — Trade Intelligence</span>
        </div>
        <div>
            <h2 className="text-2xl font-semibold mb-2">
              {welcomeName ? `Welcome back, ${welcomeName}` : 'Freight Intelligence Platform'}
            </h2>
          <p className="text-white/80 text-sm">Search companies by trade activity, track shipments, and automate outreach.</p>
        </div>
        </div>
        <div className="w-full md:w-1/2 flex items-center">
          <Card className="rounded-none border-0 w-full bg-white">
          <CardHeader className="pb-2">
              <CardTitle className="text-xl">{welcomeName ? `Welcome back, ${welcomeName}` : 'Sign in to LIT'}</CardTitle>
            {err && <p className="text-red-600 text-sm mt-1">{err}</p>}
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <form onSubmit={handleEmailPassword} className="grid grid-cols-1 gap-3">
              <input
                type="email"
                className="border rounded px-3 py-2"
                placeholder="Work email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                className="border rounded px-3 py-2"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={handleGoogle} className="justify-start gap-3">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
                <span>Continue with Google</span>
              </Button>
              <Button variant="outline" onClick={handleMicrosoft} className="justify-start gap-3">
                <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" className="w-4 h-4" />
                <span>Continue with Microsoft</span>
              </Button>
            </div>
            <div className="text-sm text-gray-500 pt-2">
              Don’t have an account? <button className="text-blue-600 hover:underline" onClick={() => nav('/signup')}>Start your 14‑day trial</button>
            </div>
          </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
