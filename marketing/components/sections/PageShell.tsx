import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/nav/Footer";

/**
 * Wraps every public page with the standard nav + footer. Keeps route files
 * focused on content and metadata.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main>{children}</main>
      <Footer />
    </>
  );
}
