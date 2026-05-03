/**
 * /studio — Sanity Studio embedded inside Next.js. The marketing team
 * (and AI agents via the write API) authors all content here without
 * leaving the brand domain. NextStudio injects the necessary scripts
 * and styles; we hand it the same defineConfig used by sanity.config.ts.
 */
"use client";

import { NextStudio } from "next-sanity/studio";
import config from "../../../sanity.config";

export default function StudioPage() {
  return <NextStudio config={config} />;
}
