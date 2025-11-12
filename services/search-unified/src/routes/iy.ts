import { Router } from "express";

const router = Router();
const SEARCH_ROUTE = "/public/iy/searchShippers";
const BOLS_ROUTE = "/public/iy/companyBols";
const USER_AGENT = "lit-intel/iy-bridge";

router.post(SEARCH_ROUTE, async (req, res) => {
  const started = Date.now();
  const url = process.env.IY_DMA_SEARCH_URL;
  if (!url) {
    res.status(500).json({ code: 500, message: "IY_DMA_SEARCH_URL not configured" });
    console.error(
      JSON.stringify({
        level: "error",
        route: SEARCH_ROUTE,
        duration_ms: Date.now() - started,
        error_code: "config_missing",
      }),
    );
    return;
  }

  const { q, limit = 10, offset = 0 } = req.body ?? {};
  if (!q || typeof q !== "string") {
    res.status(400).json({ code: 400, message: "q required" });
    console.warn(
      JSON.stringify({
        level: "warn",
        route: SEARCH_ROUTE,
        duration_ms: Date.now() - started,
        error_code: "q_required",
      }),
    );
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.IY_API_KEY ?? "",
        "user-agent": USER_AGENT,
      },
      body: JSON.stringify({
        q,
        limit: Number.isFinite(Number(limit)) ? Number(limit) : 10,
        offset: Number.isFinite(Number(offset)) ? Number(offset) : 0,
      }),
    });
    const data = await response.json().catch(() => ({}));

    res.status(response.status).json({ ok: response.ok, data });
    console.log(
      JSON.stringify({
        level: response.ok ? "info" : "warn",
        route: SEARCH_ROUTE,
        duration_ms: Date.now() - started,
        status_code: response.status,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        route: SEARCH_ROUTE,
        duration_ms: Date.now() - started,
        error_code: "importyeti_upstream_failed",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    res.status(502).json({ code: 502, message: "ImportYeti DMA upstream failed" });
  }
});

router.get(BOLS_ROUTE, async (req, res) => {
  const started = Date.now();
  const base = process.env.IY_DMA_SHIPMENTS_URL;
  if (!base) {
    res.status(500).json({ code: 500, message: "IY_DMA_SHIPMENTS_URL not configured" });
    console.error(
      JSON.stringify({
        level: "error",
        route: BOLS_ROUTE,
        duration_ms: Date.now() - started,
        error_code: "config_missing",
      }),
    );
    return;
  }

  const { company_id, limit = "20", offset = "0" } = req.query as Record<string, string | undefined>;
  if (!company_id) {
    res.status(400).json({ code: 400, message: "company_id required" });
    console.warn(
      JSON.stringify({
        level: "warn",
        route: BOLS_ROUTE,
        duration_ms: Date.now() - started,
        error_code: "company_id_required",
      }),
    );
    return;
  }

  try {
    const u = new URL(base);
    u.searchParams.set("company_id", company_id);
    u.searchParams.set("limit", String(limit ?? "20"));
    u.searchParams.set("offset", String(offset ?? "0"));

    const response = await fetch(u, {
      method: "GET",
      headers: {
        "x-api-key": process.env.IY_API_KEY ?? "",
        "user-agent": USER_AGENT,
      },
    });
    const data = await response.json().catch(() => ({}));

    res.status(response.status).json({ ok: response.ok, data });
    console.log(
      JSON.stringify({
        level: response.ok ? "info" : "warn",
        route: BOLS_ROUTE,
        duration_ms: Date.now() - started,
        status_code: response.status,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        route: BOLS_ROUTE,
        duration_ms: Date.now() - started,
        error_code: "importyeti_upstream_failed",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    res.status(502).json({ code: 502, message: "ImportYeti DMA upstream failed" });
  }
});

export default router;


