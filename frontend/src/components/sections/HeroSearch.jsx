import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";

export default function HeroSearch() {
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const goSearch = () => {
    if (user) nav("/app/search");
    else nav(`/login?next=${encodeURIComponent("/app/search")}`);
  };

  return (
    <section className="py-16 bg-white">
      <div className="mx-auto max-w-5xl text-center space-y-4">
        <h1 className="text-3xl font-bold">Search shippers instantly</h1>
        <Button onClick={goSearch}>Open Search</Button>
      </div>
    </section>
  );
}
