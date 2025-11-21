// services/search-unified/src/routes/iy.ts

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";

const router = Router();

// -----------------------------------------------------------------------------
// ImportYeti base + helpers
// -----------------------------------------------------------------------------

const IY_BASE =
  process.env.IY_DMA_BASE_URL || "https://data.importyeti.com/v1.0";
const IY_KEY =
  process.env.IY_DMA_API_KEY || process.env.IY_API_KEY || "";

/**
 * Basic GET wrapper around ImportYeti v1.0
 */
async function iyGet<T>(path: string): Promise<T> {
  if (!IY_KEY) {
    const err: any = new Error("IY_DMA_API_KEY (or IY_API_KEY) not configured");
    err.status = 500;
    throw err;
  }

  const url = `${IY_BASE}${path}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      IYApiKey: IY_KEY,
    },
  });

  const text = await resp.text();
  let json: unknown = {};

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  if (!resp.ok) {
    const message =
      (typeof json === "object" &&
        json !== null &&
        "message" in json &&
        typeof (json as any).message === "string" &&
        (json as any).message) ||
      text ||
      resp.statusText;

    const err: any = new Error(`ImportYeti ${resp.status}: ${message}`);
    err.status = resp.status;
    err.payload = json;
    throw err;
  }

  return json as T;
}

/**
 * Simple ImportYeti company search helper.
 * We keep this conservative: GET /company/search?q=...
 * and slice results locally for pagination.
 */
async function iySearch(
  q: string,
  page: number,
  pageSize: number,
): Promise<{
  ok: boolean;
  rows: any[];
  total: number;
  meta: { q: string; page: number; pageSize: number };
  data: { rows: any[]; total: number };
}> {
  const trimmed = q.trim();

  if (!trimmed) {
    return {
      ok: true,
      rows: [],
      total: 0,
      meta: { q: trimmed, page, pageSize },
      data: { rows: [], total: 0 },
    };
  }

  const searchPath = (() => {
    const basePath = "/company/search";
    const qs = new URLSearchParams();
    qs.set("q", trimmed);
    return `${basePath}?${qs.toString()}`;
  })();

  const resp = await iyGet<{ data?: any[] }>(searchPath);
  const allRows = Array.isArray(resp.data) ? resp.data : [];

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const rows = allRows.slice(start, end);
  const total = allRows.length;

  return {
    ok: true,
    rows,
    total,
    meta: { q: trimmed, page, pageSize },
    data: { rows, total },
  };
}

// -----------------------------------------------------------------------------
// POST /public/iy/searchShippers
// (index.ts does: app.use("/public/iy", router))
// -----------------------------------------------------------------------------

router.post(
  "/searchShippers",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as {
        q?: string;
        query?: string;
        page?: number;
        pageSize?: number;
        limit?: number;
        offset?: number;
      };

      const q = body.q ?? body.query ?? "";
      const page =
        typeof body.page === "number" && Number.isFinite(body.page)
          ? body.page
          : 1;
      const pageSize =
        typeof body.pageSize === "number" && Number.isFinite(body.pageSize)
          ? body.pageSize
          : body.limit && Number.isFinite(body.limit)
            ? (body.limit as number)
            : 25;

      const result = await iySearch(q, page, pageSize);

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// POST /public/iy/companyBols
// (frontend sends JSON: { company_id, limit, offset, ... })
// -----------------------------------------------------------------------------

router.post(
  "/companyBols",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as {
        company_id?: string;
        company?: string;
        limit?: number;
        offset?: number;
        start_date?: string;
        end_date?: string;
      };

      const companyIdRaw = (body.company_id ?? body.company ?? "").toString();
      const companyId = companyIdRaw.trim();

      if (!companyId) {
        return res
          .status(400)
          .json({ ok: false, message: "company_id (or company) is required" });
      }

      const start_date =
        typeof body.start_date === "string" ? body.start_date : "";
      const end_date =
        typeof body.end_date === "string" ? body.end_date : "";

      const limitRaw =
        typeof body.limit === "number" && Number.isFinite(body.limit)
          ? body.limit
          : 25;
      const offsetRaw =
        typeof body.offset === "number" && Number.isFinite(body.offset)
          ? body.offset
          : 0;

      const page_size = Math.max(1, Math.min(50, limitRaw || 25));
      const offset = Math.max(0, offsetRaw || 0);

      // 1) Get BOL numbers for this company
      const qs = new URLSearchParams();
      if (start_date) qs.set("start_date", start_date);
      if (end_date) qs.set("end_date", end_date);
      qs.set("page_size", String(page_size));
      qs.set("offset", String(offset));

      const listResp = await iyGet<{
        data: string[];
        requestCost?: number;
        creditsRemaining?: number;
        executionTime?: string;
      }>(`/company/${encodeURIComponent(companyId)}/bols?${qs.toString()}`);

      const bolNumbers = Array.isArray(listResp.data) ? listResp.data : [];

      // 2) Hydrate each BOL with /bol/{number}
      const maxDetail = Math.min(bolNumbers.length, page_size);
      const toFetch = bolNumbers.slice(0, maxDetail);

      const detailRows: any[] = [];
      const concurrency = 5;

      for (let i = 0; i < toFetch.length; i += concurrency) {
        const chunk = toFetch.slice(i, i + concurrency);

        const results = await Promise.allSettled(
          chunk.map((num) =>
            iyGet<any>(`/bol/${encodeURIComponent(num)}`),
          ),
        );

        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const b = r.value?.data ?? r.value;

          const arrival = b?.arrival_date ?? null;

          const addr = b?.company_address_geocode?.address_components ?? {};
          const city = addr.city ?? null;
          const state = addr.state ?? null;
          const zip = addr.zip ?? null;
          const country = addr.country ?? null;

          const destParts = [city, state, zip, country].filter(Boolean);
          const destination =
            destParts.length > 0
              ? destParts.join(", ")
              : b?.company_address ?? null;

          const origin =
            b?.exit_port ||
            b?.place_of_receipt ||
            b?.entry_port ||
            null;

          const teu =
            b?.teu != null && !Number.isNaN(Number(b.teu))
              ? Number(b.teu)
              : undefined;

          detailRows.push({
            bol_number: b?.bol_number ?? null,
            shipped_on: arrival,
            origin,
            destination,
            origin_country: b?.supplier_country_code ?? null,
            dest_city: city,
            dest_state: state,
            dest_zip: zip,
            dest_country: country,
            teu,
            hs_code: b?.hs_code ?? null,
            carrier: b?.carrier_scac_code ?? null,
          });
        }
      }

      // Sort newest first
      detailRows.sort((a, b) => {
        const da = a.shipped_on ? Date.parse(a.shipped_on) : 0;
        const db = b.shipped_on ? Date.parse(b.shipped_on) : 0;
        return db - da;
      });

      const total = detailRows.length;

      return res.json({
        ok: true,
        total,
        rows: detailRows,
        data: {
          total,
          rows: detailRows,
        },
      });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
