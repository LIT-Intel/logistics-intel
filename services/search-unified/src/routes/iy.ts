import { Router } from "express";
import fetch from "node-fetch";
import env from "../env.js";

const router = Router();

const SEARCH_URL = env.IY_DMA_SEARCH_URL;
const COMPANY_BOLS_URL = env.IY_DMA_COMPANY_BOLS_URL;

function buildHeaders() {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (env.IY_DMA_API_KEY) {
    headers["x-api-key"] = env.IY_DMA_API_KEY;
  }
  return headers;
}

router.post("/searchShippers", async (req, res) => {
  try {
    if (!SEARCH_URL) {
      return res.status(500).json({
        ok: false,
        error: "config_missing",
        detail: "IY_DMA_SEARCH_URL is not configured",
      });
    }

    const { q, limit = 10, offset = 0 } = req.body ?? {};
    const keyword = typeof q === "string" ? q.trim() : "";
    if (!keyword) {
      return res
        .status(400)
        .json({ ok: false, error: "q_required", detail: "q (string) is required" });
    }

    const safeLimit = Math.max(1, Math.min(100, Number(limit ?? 10)));
    const safeOffset = Math.max(0, Number(offset ?? 0));

    const upstream = await fetch(SEARCH_URL, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ q: keyword, limit: safeLimit, offset: safeOffset }),
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502).json({
        ok: false,
        error: "importyeti_upstream_error",
        status: upstream.status,
        detail: payload,
      });
    }

    const rows = Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.items)
          ? payload.items
          : [];
    const total =
      typeof payload?.total === "number"
        ? payload.total
        : typeof payload?.meta?.total === "number"
          ? payload.meta.total
          : rows.length;

    return res.json({ ok: true, rows, total });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: "importyeti_request_failed",
      detail: err?.message ?? String(err),
    });
  }
});

router.post("/companyBols", async (req, res) => {
  try {
    if (!env.IMPORTYETI_PRO_ENABLED) {
      return res.status(402).json({
        ok: false,
        error: "importyeti_pro_required",
        detail: "ImportYeti BOL access requires a Pro subscription.",
        feature: "importyeti_shipments",
      });
    }

    if (!COMPANY_BOLS_URL) {
      return res.status(500).json({
        ok: false,
        error: "config_missing",
        detail: "IY_DMA_COMPANY_BOLS_URL is not configured",
      });
    }

    const { company_id, companyKey, limit = 50, offset = 0 } = req.body ?? {};
    const companyId =
      typeof company_id === "string" && company_id.trim()
        ? company_id.trim()
        : typeof companyKey === "string" && companyKey.trim()
          ? companyKey.trim()
          : "";

    if (!companyId) {
      return res.status(400).json({
        ok: false,
        error: "company_id_required",
        detail: "company_id (string) is required",
      });
    }

    const safeLimit = Math.max(1, Math.min(200, Number(limit ?? 50)));
    const safeOffset = Math.max(0, Number(offset ?? 0));

    const upstream = await fetch(COMPANY_BOLS_URL, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        company_id: companyId,
        limit: safeLimit,
        offset: safeOffset,
      }),
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502).json({
        ok: false,
        error: "importyeti_upstream_error",
        status: upstream.status,
        detail: payload,
      });
    }

    const rows = Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

    return res.json({ ok: true, rows });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: "importyeti_request_failed",
      detail: err?.message ?? String(err),
    });
  }
});

export default router;
