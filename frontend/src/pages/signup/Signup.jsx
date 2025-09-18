import React, { useEffect, useState } from "react";
import PublicHeader from "@/components/layout/PublicHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { loginWithGoogle, loginWithMicrosoft, registerWithEmailPassword } from "@/auth/firebaseClient";

export default function Signup() {
  const navigate = useNavigate();
  const [err, setErr] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { document.title = "Start your 14‑day trial — Logistic Intel"; }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicHeader />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          <div className="hidden md:flex bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 rounded-2xl text-white p-8 flex-col justify-end">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Welcome to Logistic Intel</h2>
              <p className="text-white/80 text-sm">Create your account to unlock trade intelligence, shipment tracking, and AI-driven outreach.</p>
            </div>
          </div>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Create your account</CardTitle>
              {err && <p className="text-red-600 text-sm mt-1">{err}</p>}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 mb-4">
                <Button variant="outline" onClick={async () => { try { setErr(""); await loginWithGoogle(); navigate('/app/dashboard'); } catch (e) { setErr(e?.message || 'Google sign-in failed'); } }} className="justify-start gap-3">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
                  <span>Continue with Google</span>
                </Button>
                <Button variant="outline" onClick={async () => { try { setErr(""); await loginWithMicrosoft(); navigate('/app/dashboard'); } catch (e) { setErr(e?.message || 'Microsoft sign-in failed'); } }} className="justify-start gap-3">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" className="w-4 h-4" />
                  <span>Continue with Microsoft</span>
                </Button>
              </div>
              <form
                className="grid grid-cols-1 gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    setErr("");
                    setSubmitting(true);
                    await registerWithEmailPassword({ fullName, email, password });
                    alert("Check your inbox to verify your email. After verification, you can sign in.");
                    navigate('/login');
                  } catch (e) {
                    setErr(e?.message || 'Sign-up failed');
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                <input className="border rounded px-3 py-2" type="text" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                <input className="border rounded px-3 py-2" type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <input className="border rounded px-3 py-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <Button type="submit" disabled={submitting} className="bg-gray-900 hover:bg-black">{submitting ? 'Creating account…' : 'Start 14‑day free trial'}</Button>
                <Button type="button" variant="outline" onClick={() => navigate('/login')}>Sign in instead</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

