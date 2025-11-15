import { Router } from "express";
import type { Request, Response } from "express";
import { getFilterOptions } from "../services/filters.js";
import { getCompanyShipments } from "../services/company.js";
import { searchCompanies } from "../services/search.js";

const router = Router();
const ROUTE = "/public/getFilterOptions";

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : entry == null ? "" : String(entry)))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
};

router.get(ROUTE, async (_req: Request, res: Response) => {
  const started = Date.now();
  try {
    const data = await getFilterOptions();
    const duration = Date.now() - started;
    console.log(
      JSON.stringify({
        level: "info",
        route: ROUTE,
        duration_ms: duration,
      }),
    );
    res.status(200).json(data);
  } catch (err: unknown) {
    const duration = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    res.locals.error_code = "filters_failed";
    console.error(
      JSON.stringify({
        level: "error",
        route: ROUTE,
        duration_ms: duration,
        error_code: "filters_failed",
        message,
      }),
    );
    res.status(500).json({ ok: false, error_code: "filters_failed" });
  }
});

const SEARCH_ROUTE = "/public/searchCompanies";

router.post(SEARCH_ROUTE, async (req: Request, res: Response) => {
  const started = Date.now();
  const body = (req.body ?? {}) as Record<string, unknown>;
  const qRaw =
    typeof body.q === "string"
      ? body.q
      : typeof body.keyword === "string"
        ? body.keyword
        : "";
  const limitCandidate = Number(body.limit);
  const offsetCandidate = Number(body.offset);
  const limit = Number.isFinite(limitCandidate) ? limitCandidate : 25;
  const offset = Number.isFinite(offsetCandidate) ? offsetCandidate : 0;

  const origins = toStringArray(body.origin);
  const dests = toStringArray(body.dest);
  const modes = toStringArray(body.mode);
  const hs = toStringArray(body.hs);
  const carriers = toStringArray(body.carrier);

  console.log("[searchCompanies] req", {
    q: qRaw.trim(),
    originsCount: origins.length,
    destsCount: dests.length,
    modesCount: modes.length,
    hsCount: hs.length,
    carriersCount: carriers.length,
    limit,
    offset,
  });

  try {
    const payload = {
      ...body,
      q: qRaw,
      keyword: qRaw,
      origin: origins,
      origins,
      dest: dests,
      destinations: dests,
      mode: modes,
      modes,
      hs: hs,
      hsCodes: hs,
      carrier: carriers,
      carriers,
      limit,
      offset,
    };

    const data = await searchCompanies(payload);
    const duration = Date.now() - started;
    console.log(
      JSON.stringify({
        level: "info",
        route: SEARCH_ROUTE,
        duration_ms: duration,
      }),
    );
    const rows = Array.isArray((data as any)?.rows)
      ? (data as any).rows
      : Array.isArray((data as any)?.results)
        ? (data as any).results
        : [];
    const total = typeof (data as any)?.total === "number" ? (data as any).total : rows.length;

    console.log("[searchCompanies] response", {
      total,
      rowsLength: rows.length,
    });

    res.status(200).json(data);
  } catch (err: unknown) {
    const duration = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    res.locals.error_code = "search_failed";
    console.error(
      JSON.stringify({
        level: "error",
        route: SEARCH_ROUTE,
        duration_ms: duration,
        error_code: "search_failed",
        message,
      }),
    );
    res.status(500).json({ ok: false, error_code: "search_failed" });
  }
});

const COMPANY_SHIPMENTS_ROUTE = "/public/getCompanyShipments";

router.get(COMPANY_SHIPMENTS_ROUTE, async (req: Request, res: Response) => {
  const started = Date.now();
  try {
    const companyId = typeof req.query.company_id === "string" ? req.query.company_id : "";
    const limit = Number(req.query.limit ?? 25);
    const offset = Number(req.query.offset ?? 0);

    const data = await getCompanyShipments(companyId, limit, offset);
    res.status(200).json(data);

    console.log(
      JSON.stringify({
        level: "info",
        route: COMPANY_SHIPMENTS_ROUTE,
        duration_ms: Date.now() - started,
      }),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "missing_company_id" ? 400 : 500;
    res.locals.error_code = message;
    res.status(status).json({ ok: false, error_code: message });

    console.error(
      JSON.stringify({
        level: "error",
        route: COMPANY_SHIPMENTS_ROUTE,
        duration_ms: Date.now() - started,
        error_code: message,
      }),
    );
  }
});

export default router;


