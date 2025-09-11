import React from "react";
import LogoIcon from "../ui/LogoIcon";
import { Button } from "../ui/button";

export default function MarketingHeader() {
  return (
    <header className="border-b p-4 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <LogoIcon size={22}/>
        <span className="font-semibold">Logistic Intel</span>
      </div>
      <nav className="hidden md:flex gap-4 text-sm">
        <a href="/#features" className="hover:underline">Features</a>
        <a href="/#pricing" className="hover:underline">Pricing</a>
      </nav>
      <Button as="a" href="/login">Login</Button>
    </header>
  );
}
