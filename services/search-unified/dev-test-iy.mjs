// dev-test-iy.mjs
// Simple Node script to test /public/iy/searchShippers with proper JSON.

import http from "node:http";

const payload = JSON.stringify({
  q: "walmart",
  limit: 5,
  offset: 0,
});

const options = {
  hostname: "localhost",
  port: 8080,
  path: "/public/iy/searchShippers",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  },
};

const req = http.request(options, (res) => {
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
