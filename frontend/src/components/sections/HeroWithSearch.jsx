import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";

export default function HeroWithSearch() {
  const { user } = useAuth();
  const nav = useNavigate();

  const handlePrimary = () => {
    if (user) nav("/app/search");
    else nav(`/login?next=${encodeURIComponent("/app/search")}`);
  };

  return (
    <section className="py-20 bg-gray-50">
      <div className="mx-auto max-w-6xl text-center space-y-4">
        <h1 className="text-4xl font-bold">Freight intelligence, fast.</h1>
        <Button onClick={handlePrimary}>Start Searching</Button>
      </div>
    </section>
  );
}
