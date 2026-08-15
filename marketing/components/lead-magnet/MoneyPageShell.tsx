import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/nav/Footer";

/**
 * Conversion-page shell. It intentionally keeps the same navigation,
 * background, and footer as the rest of the marketing site so visitors do
 * not feel as though a lead page sent them to a different brand.
 */
export function MoneyPageShell({
  children,
  startHref: _startHref = "#start",
}: {
  children: React.ReactNode;
  /** Anchor for the trial CTA — defaults to the hero form. */
  startHref?: string;
}) {
  return (
    <>
      <Nav />
      <main className="min-h-screen bg-section">{children}</main>
      <Footer />
    </>
  );
}
