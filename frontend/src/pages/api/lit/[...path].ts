import type { NextApiRequest, NextApiResponse } from "next";

const API_BASE = process.env.API_GATEWAY_BASE!;
const ALLOWED_PREFIXES = ["/public/"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const segs = (req.query.path ?? []) as string[] | string;
    const path = Array.isArray(segs) ? segs.join("/") : String(segs || "");
    const targetPath = `/${path}`;

    if (!ALLOWED_PREFIXES.some(p => targetPath.startsWith(p))) {
      res.status(403).json({ error: "Blocked path" });
      return;
    }

    const qs = req.url && req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
    const url = `${API_BASE}${targetPath}${qs}`;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string" && ["content-type", "authorization"].includes(k.toLowerCase())) {
        headers.set(k, v);
      }
    }

    const init: RequestInit = {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : (req as any),
      // @ts-ignore node-fetch duplex hint
      duplex: "half",
    };

    const r = await fetch(url, init);
    res.status(r.status);
    r.headers.forEach((val, key) => {
      if (["content-type", "content-length"].includes(key)) res.setHeader(key, val);
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (err: any) {
    console.error(err);
    res.status(502).json({ error: "Proxy error", detail: String(err?.message || err) });
  }
}
