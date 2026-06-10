/**
 * Top 100 Active U.S. Shippers — lead-magnet PDF generator.
 *
 * Pipeline:
 *   1. Read tmp/top-100-shippers/raw-data.json (sorted by rank).
 *   2. Render a clean markdown report (cover/TOC come from make-pdf flags).
 *   3. Shell out to the gstack `make-pdf` binary, which renders publication-
 *      quality PDFs via Paged.js + headless Chromium.
 *
 * Output: marketing/public/lead-magnets/top-100-shippers.pdf
 *
 * Reruns: `npm run build:lead-magnet:top100` from marketing/.
 *
 * Why make-pdf instead of @react-pdf/renderer:
 *   The earlier @react-pdf approach hit a pagination bug where 28-row chunks
 *   produced blank pages and dropped 23 rows per chunk. Switching to the
 *   project's standard PDF skill (Paged.js + Helvetica) renders the 100-row
 *   table cleanly across 4 pages with a proper cover, TOC, and page numbers.
 *
 * Requirements:
 *   - The gstack make-pdf binary at ~/.claude/skills/gstack/make-pdf/dist/pdf
 *     (or set $MAKE_PDF_BIN). If missing, run `./setup` in the gstack repo.
 *   - The browse binary state dir (`.gstack/` at repo root) must not already
 *     exist as a stale file. The script moves it aside during generation
 *     and restores it after — a workaround for a known browse mkdir quirk.
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

type Shipper = {
  rank: number;
  name: string;
  city: string | null;
  state: string | null;
  shipment_volume: number;
  volume_metric: string;
  last_shipment_date: string | null;
  primary_hs_code: string | null;
  industry: string | null;
};

const REPO_ROOT = resolve(__dirname, "..", "..");
const DATA_PATH = join(REPO_ROOT, "tmp/top-100-shippers/raw-data.json");
const MD_PATH = join(REPO_ROOT, "tmp/top-100-shippers/report.md");
const OUT_PATH = join(
  REPO_ROOT,
  "marketing/public/lead-magnets/top-100-shippers.pdf",
);
const GSTACK_AUDIT_DIR = join(REPO_ROOT, ".gstack");
const GSTACK_AUDIT_DIR_BAK = `${GSTACK_AUDIT_DIR}.tmp-makepdf-backup`;

function locateMakePdfBin(): string {
  if (process.env.MAKE_PDF_BIN) return process.env.MAKE_PDF_BIN;
  const candidate = join(
    homedir(),
    ".claude/skills/gstack/make-pdf/dist/pdf",
  );
  if (!existsSync(candidate)) {
    throw new Error(
      `make-pdf binary not found at ${candidate}. Run ./setup in the gstack repo.`,
    );
  }
  return candidate;
}

function fmtLoc(city: string | null, state: string | null): string {
  const c = (city || "").trim();
  const s = (state || "").trim();
  if (!c && !s) return "Unknown";
  if (!c) return s;
  if (!s) return c;
  return `${c}, ${s}`;
}

function fmtNum(n: number): string {
  return Number(n || 0).toLocaleString("en-US");
}

function buildMarkdown(data: Shipper[]): string {
  const rows = data
    .map(
      (r) =>
        `| ${r.rank} | ${r.name} | ${fmtLoc(r.city, r.state)} | ${fmtNum(
          r.shipment_volume,
        )} |`,
    )
    .join("\n");
  return `## Why this list

Every shipment crossing into the United States generates a bill of lading. Logistic Intel ingests those filings, normalizes the consignee, and tracks volume over the last twelve months. The 100 companies below are the busiest U.S. import consignees in our dataset, sorted by total shipment count. The list is current through May 2026.

Volume metric: shipment count of customs records (bills of lading) attributed to the consignee. HS codes, per-shipment detail, decision-maker contacts, and live lane activity sit inside the Logistic Intel app.

## The list

| Rank | Company | Location | Shipments |
|-----:|:--------|:---------|----------:|
${rows}

## Get the full picture

Logistic Intel pairs every shipper above with decision-maker contacts, live lane activity, HS-code mix, and per-shipment detail, refreshed weekly from customs filings. Start a free trial and pull a target list for your lane in under five minutes.

Start a free trial at **logisticintel.com/signup**.

---

*About the data: shipment counts reflect bills of lading filed with US Customs and Border Protection over the trailing twelve months. Names and locations are as filed. HS codes, per-shipment detail, and decision-maker contacts are available inside the Logistic Intel app and are not included in this PDF.*
`;
}

function main() {
  const raw = readFileSync(DATA_PATH, "utf8");
  const data: Shipper[] = JSON.parse(raw);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No records in ${DATA_PATH}`);
  }
  data.sort((a, b) => a.rank - b.rank);

  mkdirSync(join(REPO_ROOT, "tmp/top-100-shippers"), { recursive: true });
  writeFileSync(MD_PATH, buildMarkdown(data));
  mkdirSync(join(REPO_ROOT, "marketing/public/lead-magnets"), {
    recursive: true,
  });

  // make-pdf reads any existing output file as additional input. Wipe it so
  // the new PDF starts fresh.
  if (existsSync(OUT_PATH)) unlinkSync(OUT_PATH);

  // Work around a browse binary mkdir bug on existing .gstack/ dir.
  const stashedAudit = existsSync(GSTACK_AUDIT_DIR);
  if (stashedAudit) renameSync(GSTACK_AUDIT_DIR, GSTACK_AUDIT_DIR_BAK);

  try {
    const bin = locateMakePdfBin();
    // Positionals BEFORE flags — make-pdf's arg parser requires this order.
    execSync(
      [
        JSON.stringify(bin),
        "generate",
        JSON.stringify(MD_PATH),
        JSON.stringify(OUT_PATH),
        "--cover",
        "--toc",
        '--title "Top 100 Active U.S. Shippers"',
        '--author "Logistic Intel"',
        '--date "Q2 2026"',
        "--no-confidential",
      ].join(" "),
      { stdio: "inherit", cwd: REPO_ROOT },
    );
  } finally {
    if (stashedAudit && existsSync(GSTACK_AUDIT_DIR_BAK)) {
      try {
        renameSync(GSTACK_AUDIT_DIR_BAK, GSTACK_AUDIT_DIR);
      } catch {
        // If browse already recreated .gstack/, leave the backup behind for
        // manual cleanup rather than crash mid-script.
      }
    }
  }

  console.log(`[top-100-pdf] wrote ${OUT_PATH}`);
}

main();
