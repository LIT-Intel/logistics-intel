import LogoIcon from "@/components/ui/LogoIcon";
import { Button } from "@/components/ui/button";

export default function MarketingHeader() {
  return (
    <header className="border-b p-4 flex justify-between items-center bg-white/80 backdrop-blur">
      <div className="flex items-center gap-2">
        <LogoIcon size={22} />
        <span className="font-semibold">Logistic Intel</span>
      </div>
      <nav className="hidden md:flex gap-4 text-sm">
        <a href="/#features" className="hover:underline">Features</a>
        <a href="/#pricing" className="hover:underline">Pricing</a>
        <a href="/#docs" className="hover:underline">Docs</a>
      </nav>
      <div className="flex items-center gap-2">
        <a className="text-sm text-neutral-700 hover:underline" href="/login">Sign in</a>
        <Button as="a" href="/signup">Get started</Button>
      </div>
    </header>
  );
}
