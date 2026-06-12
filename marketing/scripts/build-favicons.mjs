// Generate favicon + PWA icon assets from marketing/public/favicon.svg.
// Uses @resvg/resvg-wasm (already a transitive dep) to render PNGs and a
// small hand-rolled encoder to wrap them in an ICO container.
//
// Run with: npm run build:favicons   (from marketing/)
//
// Outputs to marketing/public/:
//   - favicon.ico           (multi-size: 16, 32, 48 PNG-encoded)
//   - apple-touch-icon.png  (180x180, opaque)
//   - icon-192.png          (192x192, opaque)
//   - icon-512.png          (512x512, opaque)
//   - icon-maskable-512.png (512x512, ~20% safe zone, opaque)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initWasm, Resvg } from "@resvg/resvg-wasm";

const here = path.dirname(fileURLToPath(import.meta.url));
const marketingRoot = path.resolve(here, "..");
const publicDir = path.join(marketingRoot, "public");

const SLATE_BG = "#0F172A"; // brand slate
const SOURCE_SVG = path.join(publicDir, "favicon.svg");

// The source SVG is a 24x24 viewBox with the LIT mark inscribed on a #020617
// rounded square. For icon assets we want to render the mark on the canonical
// slate background (#0F172A) with the rounded square scaled to fill the canvas
// minus a configurable safe-zone padding. We strip the inner rounded square so
// the slate background fills cleanly, then upscale via resvg.
function buildIconSvg({ size, paddingPct }) {
  // Strategy: take the 24x24 vector and render it centered inside `size`,
  // surrounded by a slate background. We do this with an outer wrapper SVG
  // so we don't have to mutate the original markup. paddingPct describes the
  // fraction of total size reserved as safe-zone on each edge (0 -> edge to
  // edge, 0.2 -> 20% safe zone, used for the maskable variant).
  const inner = Math.round(size * (1 - paddingPct * 2));
  const offset = Math.round((size - inner) / 2);
  // Drop the source SVG's inner background rect so our outer slate shows
  // through cleanly; keep only the stroked mark.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${SLATE_BG}"/>
  <svg x="${offset}" y="${offset}" width="${inner}" height="${inner}" viewBox="0 0 24 24">
    <g stroke="#00F0FF" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M4 4v16h7.8"/>
      <path d="M10.35 4h9.65"/>
      <path d="M10.35 10h4.2"/>
      <path d="M15.85 10v9.9"/>
      <path d="M10.35 19.9h5.5"/>
    </g>
  </svg>
</svg>`;
}

async function renderPng({ size, paddingPct }) {
  const svg = buildIconSvg({ size, paddingPct });
  const resvg = new Resvg(svg, {
    background: SLATE_BG,
    fitTo: { mode: "width", value: size },
    shapeRendering: 2, // geometric precision
    imageRendering: 0, // optimize quality
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  rendered.free();
  resvg.free();
  return Buffer.from(png);
}

// Minimal ICO writer that embeds raw PNG payloads. Browsers accept PNG-embedded
// ICOs since IE11 / Chrome / FF / Safari. Spec:
//   ICONDIR (6 bytes) + N * ICONDIRENTRY (16 bytes) + N * PNG bytes
function buildIco(images) {
  // images: Array<{ size: number, png: Buffer }>
  const headerSize = 6;
  const entrySize = 16;
  const dirSize = headerSize + entrySize * images.length;
  const buffers = [];

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(images.length, 4); // image count
  buffers.push(header);

  let offset = dirSize;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(entrySize);
    // 256 is encoded as 0 in the width/height byte per ICO spec.
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette count (0 = no palette)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // payload size
    entry.writeUInt32LE(offset, 12); // payload offset
    buffers.push(entry);
    offset += png.length;
  }
  for (const { png } of images) buffers.push(png);
  return Buffer.concat(buffers);
}

async function main() {
  // Boot the wasm module. resvg-wasm ships a sibling .wasm file we need to
  // hand to initWasm() as raw bytes.
  const wasmPath = path.resolve(
    marketingRoot,
    "node_modules",
    "@resvg",
    "resvg-wasm",
    "index_bg.wasm",
  );
  const wasm = await readFile(wasmPath);
  await initWasm(wasm);

  // Read source for the report.
  const srcBytes = (await readFile(SOURCE_SVG)).length;
  console.log(`source: ${path.relative(marketingRoot, SOURCE_SVG)} (${srcBytes} bytes)`);

  // Targets. Small inner padding (~8%) for the standard icons; 20% safe zone
  // for the maskable variant; tiny padding (~6%) for apple-touch-icon since
  // iOS already adds its own rounded mask.
  const targets = [
    { out: "icon-192.png",          size: 192, padding: 0.08 },
    { out: "icon-512.png",          size: 512, padding: 0.08 },
    { out: "icon-maskable-512.png", size: 512, padding: 0.20 },
    { out: "apple-touch-icon.png",  size: 180, padding: 0.06 },
  ];

  for (const t of targets) {
    const png = await renderPng({ size: t.size, paddingPct: t.padding });
    const outPath = path.join(publicDir, t.out);
    await writeFile(outPath, png);
    console.log(`wrote ${t.out} (${png.length} bytes, ${t.size}x${t.size}, pad ${(t.padding * 100).toFixed(0)}%)`);
  }

  // Build the multi-size ICO. ICO supports embedded PNGs; for tiny sizes the
  // 2px stroke can look chunky, so we crisp-render them at native size.
  const icoSizes = [16, 32, 48];
  const icoImages = [];
  for (const size of icoSizes) {
    // Tighter padding for the small sizes so the mark reads well.
    const png = await renderPng({ size, paddingPct: 0.04 });
    icoImages.push({ size, png });
  }
  const ico = buildIco(icoImages);
  const icoPath = path.join(publicDir, "favicon.ico");
  await writeFile(icoPath, ico);
  console.log(`wrote favicon.ico (${ico.length} bytes, sizes: ${icoSizes.join(",")})`);

  // Write the PWA manifest.
  const manifest = {
    name: "Logistic Intel",
    short_name: "LIT",
    description:
      "Freight revenue intelligence — shipper data, contacts, and outbound from one workspace.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0F172A",
    theme_color: "#0F172A",
    icons: [
      { src: "/favicon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/icon-maskable-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
  const manifestPath = path.join(publicDir, "site.webmanifest");
  await writeFile(manifestPath, manifestJson);
  console.log(`wrote site.webmanifest (${manifestJson.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
