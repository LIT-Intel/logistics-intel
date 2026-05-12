// One-shot helper: read affiliate-admin/index.ts and emit a JSON file
// suitable for piping into the Supabase Management API deploy endpoint.
//
// Required because adding the new `list_partner_referrals` action grew
// the function past the 32KB limit our pasted MCP deploys reliably hit,
// and we don't want to drift between the on-disk source and the deployed
// version. Mirrors the proven prepare-iy-deploy.cjs pattern.
//
// Usage (run from repo root with a valid Supabase Management API token):
//
//   node scripts/prepare-affiliate-admin-deploy.cjs
//   curl -X PATCH \
//     "https://api.supabase.com/v1/projects/jkmrfiaefxwgbvftohrb/functions/affiliate-admin" \
//     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
//     -H "Content-Type: application/json" \
//     --data-binary @scripts/affiliate-admin-deploy-payload.json

const fs = require("fs");
const path = require("path");

const src = path.join(
  __dirname,
  "..",
  "supabase",
  "functions",
  "affiliate-admin",
  "index.ts",
);
const content = fs.readFileSync(src, "utf8");

const payload = {
  name: "affiliate-admin",
  entrypoint_path: "index.ts",
  verify_jwt: true,
  files: [{ name: "index.ts", content }],
};

const out = path.join(__dirname, "affiliate-admin-deploy-payload.json");
fs.writeFileSync(out, JSON.stringify(payload));
console.log("wrote", out, "bytes:", fs.statSync(out).size);
console.log("content_len:", content.length, "lines:", content.split("\n").length);

// If SUPABASE_ACCESS_TOKEN is set, deploy directly — one-command path.
const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF || "jkmrfiaefxwgbvftohrb";
if (!token) {
  console.log("");
  console.log("SUPABASE_ACCESS_TOKEN not set — payload only. Deploy with:");
  console.log("  curl -X PATCH \\");
  console.log(`    https://api.supabase.com/v1/projects/${projectRef}/functions/affiliate-admin \\`);
  console.log('    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log("    --data-binary @scripts/affiliate-admin-deploy-payload.json");
  process.exit(0);
}

console.log("");
console.log("SUPABASE_ACCESS_TOKEN detected — deploying now…");
const https = require("https");
const url = new URL(`https://api.supabase.com/v1/projects/${projectRef}/functions/affiliate-admin`);
const body = fs.readFileSync(out);
const req = https.request({
  hostname: url.hostname,
  path: url.pathname,
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Content-Length": body.length,
  },
}, (res) => {
  let buf = "";
  res.on("data", (c) => { buf += c; });
  res.on("end", () => {
    console.log("HTTP", res.statusCode);
    try { console.log(JSON.stringify(JSON.parse(buf), null, 2)); }
    catch { console.log(buf); }
    process.exit(res.statusCode && res.statusCode < 300 ? 0 : 1);
  });
});
req.on("error", (err) => { console.error("deploy failed:", err.message); process.exit(1); });
req.write(body);
req.end();
