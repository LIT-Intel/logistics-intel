// Studio uses its own chrome; bypass the marketing-page layout's
// background gradient + grid mesh that would clash with Sanity's UI.
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "#fff" }}>{children}</div>;
}
