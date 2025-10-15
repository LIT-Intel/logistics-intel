import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function BottomCTA() {
  const nav = useNavigate();
  const loc = useLocation();
  const next = encodeURIComponent(loc.pathname + loc.search);

  return (
    <section className="py-12 bg-gray-50">
      <div className="mx-auto max-w-4xl text-center space-y-4">
        <h3 className="text-2xl font-semibold">Ready to try Logistic Intel?</h3>
        <Button onClick={() => nav(`/login?next=${next}`)}>Get Started</Button>
      </div>
    </section>
  );
}
