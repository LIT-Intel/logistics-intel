import React, { useEffect } from "react";
import PublicHeader from "@/components/layout/PublicHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Signup() {
  const navigate = useNavigate();
  useEffect(() => { document.title = "Start your 14‑day trial — Logistic Intel"; }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicHeader />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4">
              <input className="border rounded px-3 py-2" type="text" placeholder="Full name" required />
              <input className="border rounded px-3 py-2" type="email" placeholder="Work email" required />
              <input className="border rounded px-3 py-2" type="password" placeholder="Password" required />
              <Button type="submit" className="bg-gray-900 hover:bg-black">Start 14‑day free trial</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/login')}>Sign in instead</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

