import type { Metadata, Viewport } from "next";

export { metadata, viewport } from "next-sanity/studio";

export const dynamic = "force-static";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}

// Re-export to keep types stable when "next-sanity/studio" updates.
export type { Metadata, Viewport };
