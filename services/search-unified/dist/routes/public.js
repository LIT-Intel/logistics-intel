import { Router } from "express";
import { getFilterOptions } from "../services/filters.js";
import { getCompanyShipments } from "../services/company.js";
import { searchCompanies } from "../services/search.js";
const router = Router();
const ROUTE = "/public/getFilterOptions";
router.get(ROUTE, async (_req, res) => {
    const started = Date.now();
    try {
        const data = await getFilterOptions();
        const duration = Date.now() - started;
        console.log(JSON.stringify({
            level: "info",
            route: ROUTE,
            duration_ms: duration,
        }));
        res.status(200).json(data);
    }
    catch (err) {
        const duration = Date.now() - started;
        const message = err instanceof Error ? err.message : String(err);
        res.locals.error_code = "filters_failed";
        console.error(JSON.stringify({
            level: "error",
            route: ROUTE,
            duration_ms: duration,
            error_code: "filters_failed",
            message,
        }));
        res.status(500).json({ ok: false, error_code: "filters_failed" });
    }
});
const SEARCH_ROUTE = "/public/searchCompanies";
router.post(SEARCH_ROUTE, async (req, res) => {
    const started = Date.now();
    try {
        const data = await searchCompanies((req.body ?? {}));
        const duration = Date.now() - started;
        console.log(JSON.stringify({
            level: "info",
            route: SEARCH_ROUTE,
            duration_ms: duration,
        }));
        res.status(200).json(data);
    }
    catch (err) {
        const duration = Date.now() - started;
        const message = err instanceof Error ? err.message : String(err);
        res.locals.error_code = "search_failed";
        console.error(JSON.stringify({
            level: "error",
            route: SEARCH_ROUTE,
            duration_ms: duration,
            error_code: "search_failed",
            message,
        }));
        res.status(500).json({ ok: false, error_code: "search_failed" });
    }
});
const COMPANY_SHIPMENTS_ROUTE = "/public/getCompanyShipments";
router.get(COMPANY_SHIPMENTS_ROUTE, async (req, res) => {
    const started = Date.now();
    try {
        const companyId = typeof req.query.company_id === "string" ? req.query.company_id : "";
        const limit = Number(req.query.limit ?? 25);
        const offset = Number(req.query.offset ?? 0);
        const data = await getCompanyShipments(companyId, limit, offset);
        res.status(200).json(data);
        console.log(JSON.stringify({
            level: "info",
            route: COMPANY_SHIPMENTS_ROUTE,
            duration_ms: Date.now() - started,
        }));
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message === "missing_company_id" ? 400 : 500;
        res.locals.error_code = message;
        res.status(status).json({ ok: false, error_code: message });
        console.error(JSON.stringify({
            level: "error",
            route: COMPANY_SHIPMENTS_ROUTE,
            duration_ms: Date.now() - started,
            error_code: message,
        }));
    }
});
export default router;
