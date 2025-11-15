import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = join(__dirname, "..");
const sourceDir = join(rootDir, "src", "queries");
const destinationDir = join(rootDir, "dist", "queries");

if (!existsSync(sourceDir)) {
  throw new Error(`query directory not found at ${sourceDir}`);
}

mkdirSync(destinationDir, { recursive: true });

const entries = readdirSync(sourceDir);
for (const entry of entries) {
  const sourcePath = join(sourceDir, entry);
  const stat = statSync(sourcePath);
  if (stat.isFile() && entry.endsWith(".sql")) {
    const destinationPath = join(destinationDir, entry);
    copyFileSync(sourcePath, destinationPath);
  }
}


