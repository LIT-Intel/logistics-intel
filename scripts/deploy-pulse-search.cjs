// Deploy pulse-search edge fn directly via Supabase Management API.
// Run: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/deploy-pulse-search.cjs
//
// The access token is a personal token from https://supabase.com/dashboard/account/tokens
// (NOT the service role key — that one only signs DB/JWT).
const fs = require("fs");
const path = require("path");

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "jkmrfiaefxwgbvftohrb";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("missing SUPABASE_ACCESS_TOKEN env var");
  process.exit(1);
}

const FN_NAME = "pulse-search";
const srcPath = path.join(__dirname, "..", "supabase", "functions", FN_NAME, "index.ts");
const content = fs.readFileSync(srcPath, "utf8");

// Multipart/form-data per Supabase Mgmt API spec.
const boundary = "----lit-pulse-search-" + Date.now();
const meta = JSON.stringify({
  name: FN_NAME,
  entrypoint_path: "index.ts",
  verify_jwt: true,
});
const body = Buffer.concat([
  Buffer.from(`--${boundary}\r\n`),
  Buffer.from(`Content-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n`),
  Buffer.from(meta + "\r\n"),
  Buffer.from(`--${boundary}\r\n`),
  Buffer.from(`Content-Disposition: form-data; name="file"; filename="index.ts"\r\nContent-Type: application/typescript\r\n\r\n`),
  Buffer.from(content + "\r\n"),
  Buffer.from(`--${boundary}--\r\n`),
]);

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${FN_NAME}`;
(async () => {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  const text = await resp.text();
  console.log("status:", resp.status);
  console.log("body:", text.slice(0, 500));
  if (!resp.ok) process.exit(2);
})();
