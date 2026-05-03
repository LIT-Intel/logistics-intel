/**
 * Sanity Studio configuration — embedded inside Next.js at /studio.
 * Visiting https://logisticintel.com/studio loads the full Studio so the
 * marketing team (or AI agents via the write API) can publish without
 * leaving the brand domain.
 */
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./sanity/schemas";
import { structure } from "./sanity/structure";

export default defineConfig({
  name: "lit-marketing",
  title: "LIT Marketing CMS",
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "placeholder",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  basePath: "/studio",
  plugins: [
    structureTool({ structure }),
    visionTool({ defaultApiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-10-15" }),
  ],
  schema: { types: schemaTypes },
});
