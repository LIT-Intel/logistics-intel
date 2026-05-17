/**
 * Sanity CLI config. Separate from sanity.config.ts because the CLI
 * (npx sanity ...) needs project/dataset identifiers at startup before
 * the Studio config bundle is loaded.
 *
 * Used by:
 *   - `npx sanity schema deploy` to know which workspace to write
 *   - `npx sanity dataset` / `import` / etc.
 *   - `npx sanity exec` for one-off scripts
 *
 * Hard-defaults to the production project so deploys don't silently
 * point at the wrong place when env vars are missing.
 */
import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "w0whm6ow",
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  },
});
