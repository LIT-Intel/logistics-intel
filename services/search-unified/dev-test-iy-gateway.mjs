// dev-test-iy-gateway.mjs
// Test ImportYeti search through API Gateway with a proper JSON body.

import https from "node:https";

const GATEWAY_HOST = "logistics-intel-gateway-2e68g4k3.uc.gateway.dev";
const GATEWAY_PATH =
  "/public/iy/searchShippers?key=AIzaSyBNEjb09qeKKQHR7EDk_lF0UR0rQHTqqLA"; // <-- put your key here

const payload = JSON.stringify({
  q: "walmart",
  limit: 5,
  offset: 0,
});

const options = {
  hostname: GATEWAY_HOST,
  port: 443,
  path: GATEWAY_PATH,
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  },
};

const req = https.request(options, (res) => {
  console.log("STATUS:", res.statusCode);
  console.log("HEADERS:", res.headers);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("BODY:", data);
    process.exit(0);
  });
});

req.on("error", (err) => {
  console.error("Request error:", err);
  process.exit(1);
});

req.write(payload);
req.end();
