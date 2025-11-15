// services/search-unified/src/routes/iy.ts
import { Router } from "express";
import type { Request, Response } from "express";
import { iySearch, iyCompanyBols } from "../services/iy.js";

export const iyRouter = Router();

// POST /public/iy/searchShippers
iyRouter.post("/searchShippers", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const qRaw = body.q ?? body.query ?? "";
    const q = typeof qRaw === "string" ? qRaw : String(qRaw ?? "");
    const pageValue = Number(body.page);
    const pageSizeValue = Number(body.pageSize);

    console.log("[iy] searchShippers request body", JSON.stringify(body));

    const result = await iySearch({
      q,
      page: Number.isFinite(pageValue) ? pageValue : undefined,
      pageSize: Number.isFinite(pageSizeValue) ? pageSizeValue : undefined,
    });

    console.log(
      "[iy] searchShippers response meta",
      JSON.stringify({
        q: result.meta.q,
        page: result.meta.page,
        pageSize: result.meta.pageSize,
        total: result.meta.total,
        rowsLen: result.rows.length,
      }),
    );

    res.status(200).json(result);
  } catch (err) {
    const error = err as { code?: string; message?: string; status?: number };
    const code = error?.code ?? "importyeti_failed";
    const status =
      code === "importyeti_config_missing"
        ? 500
        : code === "importyeti_upstream_failed"
          ? 502
          : 500;

    console.error("[iy] /public/iy/searchShippers error", {
      code,
      status: error?.status,
      message: error?.message,
    });

    res.status(status).json({
      ok: false,
      error: {
        code,
        message: error?.message ?? "ImportYeti search failed",
      },
    });
  }
});

// GET /public/iy/companyBols
iyRouter.get("/companyBols", async (req: Request, res: Response) => {
  try {
    const company_id = String(req.query.company_id || "");
    const limit = Number(req.query.limit || 10);
    const offset = Number(req.query.offset || 0);
    const out = await iyCompanyBols({ company_id, limit, offset });
    res.status(out.ok ? 200 : out.status ?? 502).json(out);
  } catch (err) {
    res.status(500).json({ ok: false, error: "internal_error", detail: String(err) });
  }
});


