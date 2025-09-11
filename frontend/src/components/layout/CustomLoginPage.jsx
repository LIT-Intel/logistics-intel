// frontend/src/components/layout/CustomLoginPage.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loginWithGoogle, loginWithMicrosoft } from "@/auth/firebaseClient"; // ✅ ensure this line exists

export default function CustomLoginPage({ onClose }) {
  const nav = useNavigate();
  const [err, setErr] = useState("");

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

  return (
    <Card className="max-w-md mx-auto mt-12">
      <CardHeader>
        <CardTitle>Sign in to Logistic Intel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Your existing email/password fields can remain here */}

        {/* ✅ OAuth buttons */}
        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={handleGoogle}>
            Continue with Google
          </Button>
          <Button variant="outline" onClick={handleMicrosoft}>
            Continue with Microsoft
          </Button>
        </div>

        {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
      </CardContent>
    </Card>
  );
}
