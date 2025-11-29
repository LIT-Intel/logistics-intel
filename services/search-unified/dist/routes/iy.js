// services/search-unified/src/routes/iy.ts
import { Router, } from "express";
import { runGeminiAgent } from "../ai/geminiAgent.js";
const router = Router();
// -----------------------------------------------------------------------------
// ImportYeti base + helpers
// -----------------------------------------------------------------------------
const IY_BASE = process.env.IY_DMA_BASE_URL || "https://data.importyeti.com/v1.0";
const IY_KEY = process.env.IY_DMA_API_KEY || process.env.IY_API_KEY || "";
/**
 * Basic GET wrapper around ImportYeti v1.0
 */
async function iyGet(path) {
    if (!IY_KEY) {
        const err = new Error("IY_DMA_API_KEY (or IY_API_KEY) not configured");
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
    let json = {};
    if (text) {
        try {
            json = JSON.parse(text);
        }
        catch {
            json = { raw: text };
        }
    }
    if (!resp.ok) {
        const message = (typeof json === "object" &&
            json !== null &&
            "message" in json &&
            typeof json.message === "string" &&
            json.message) ||
            text ||
            resp.statusText;
        const err = new Error(`ImportYeti ${resp.status}: ${message}`);
        err.status = resp.status;
        err.payload = json;
        throw err;
    }
    return json;
}
/**
 * Simple ImportYeti company search helper.
 * We keep this conservative: GET /company/search?q=...
 * and slice results locally for pagination.
 */
async function iySearch(q, page, pageSize) {
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
        // ImportYeti accepts "name" for text search
        qs.set("name", trimmed);
        return `${basePath}?${qs.toString()}`;
    })();
    const resp = await iyGet(searchPath);
    const allRows = Array.isArray(resp.data) ? resp.data : [];
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const rawRows = allRows.slice(start, end);
    const total = allRows.length;
    const normalizedRows = rawRows.map((row, index) => {
        const fallbackTitle = row?.title ?? row?.name ?? row?.company_name ?? `Company ${index + 1}`;
        const normalizedTitle = typeof fallbackTitle === "string" ? fallbackTitle : `Company ${index + 1}`;
        const slugFromTitle = (() => {
            const base = normalizedTitle.toLowerCase().trim();
            if (!base)
                return `company-${index + 1}`;
            return base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        })();
        const key = row?.key ??
            row?.slug ??
            row?.company_slug ??
            row?.company_id ??
            (slugFromTitle ? `company/${slugFromTitle}` : `company-${index + 1}`);
        const rawWebsite = row?.website ??
            row?.company_website ??
            row?.url ??
            row?.company_url ??
            null;
        const website = typeof rawWebsite === "string" && rawWebsite.trim().length
            ? rawWebsite.trim()
            : null;
        const rawPhone = row?.phone ??
            row?.company_phone ??
            row?.phone_number ??
            row?.company_phone_number ??
            null;
        const phone = typeof rawPhone === "string" && rawPhone.trim().length
            ? rawPhone.trim()
            : null;
        let domain = row?.domain ??
            row?.company_domain ??
            row?.website_domain ??
            null;
        if (!domain && website) {
            try {
                const parsed = new URL(website.startsWith("http") ? website : `https://${website}`);
                domain = parsed.hostname;
            }
            catch {
                // ignore invalid URL parsing
            }
        }
        const derivedAddress = [
            row?.address_line1,
            row?.city ?? row?.company_city,
            row?.state ?? row?.company_state,
            row?.postal_code ?? row?.zip ?? row?.company_zip,
            row?.country ?? row?.company_country,
        ]
            .filter((part) => typeof part === "string" && part.trim().length)
            .join(", ");
        const address = row?.address ??
            row?.full_address ??
            row?.company_address ??
            (derivedAddress || null);
        const totalShipments = row?.totalShipments ??
            row?.total_shipments ??
            row?.shipments_12m ??
            row?.shipmentsLast12m ??
            row?.shipments_last_12m ??
            null;
        const mostRecentShipment = row?.mostRecentShipment ??
            row?.last_shipment_date ??
            row?.most_recent_shipment ??
            row?.lastShipmentDate ??
            null;
        const topSuppliers = Array.isArray(row?.topSuppliers)
            ? row.topSuppliers
            : Array.isArray(row?.top_suppliers)
                ? row.top_suppliers
                : null;
        return {
            title: normalizedTitle,
            countryCode: row?.countryCode ??
                row?.country_code ??
                row?.company_country_code ??
                null,
            type: row?.type ?? row?.company_type ?? null,
            address,
            totalShipments,
            mostRecentShipment,
            topSuppliers,
            key,
            website,
            phone,
            domain,
        };
    });
    return {
        ok: true,
        rows: normalizedRows,
        total,
        meta: { q: trimmed, page, pageSize },
        data: { rows: normalizedRows, total },
    };
}
// -----------------------------------------------------------------------------
// POST /public/iy/searchShippers
// (index.ts does: app.use("/public/iy", router))
// -----------------------------------------------------------------------------
router.post("/searchShippers", async (req, res, next) => {
    try {
        const body = (req.body ?? {});
        const q = body.q ?? body.query ?? "";
        const page = typeof body.page === "number" && Number.isFinite(body.page)
            ? body.page
            : 1;
        const pageSize = typeof body.pageSize === "number" && Number.isFinite(body.pageSize)
            ? body.pageSize
            : body.limit && Number.isFinite(body.limit)
                ? body.limit
                : 25;
        const result = await iySearch(q, page, pageSize);
        return res.json(result);
    }
    catch (err) {
        return next(err);
    }
});
// -----------------------------------------------------------------------------
// POST /public/iy/companyBols
// (frontend sends JSON: { company_id, limit, offset, ... })
// -----------------------------------------------------------------------------
router.post("/companyBols", async (req, res, next) => {
    try {
        const body = (req.body ?? {});
        const companyIdRaw = (body.company_id ?? body.company ?? "").toString();
        const companyId = companyIdRaw.trim();
        if (!companyId) {
            return res
                .status(400)
                .json({ ok: false, message: "company_id (or company) is required" });
        }
        const start_date = typeof body.start_date === "string" ? body.start_date : "";
        const end_date = typeof body.end_date === "string" ? body.end_date : "";
        const limitRaw = typeof body.limit === "number" && Number.isFinite(body.limit)
            ? body.limit
            : 25;
        const offsetRaw = typeof body.offset === "number" && Number.isFinite(body.offset)
            ? body.offset
            : 0;
        const page_size = Math.max(1, Math.min(50, limitRaw || 25));
        const offset = Math.max(0, offsetRaw || 0);
        // 1) Get BOL numbers for this company
        const qs = new URLSearchParams();
        if (start_date)
            qs.set("start_date", start_date);
        if (end_date)
            qs.set("end_date", end_date);
        qs.set("page_size", String(page_size));
        qs.set("offset", String(offset));
        const listResp = await iyGet(`/company/${encodeURIComponent(companyId)}/bols?${qs.toString()}`);
        const bolNumbers = Array.isArray(listResp.data) ? listResp.data : [];
        // 2) Hydrate each BOL with /bol/{number}
        const maxDetail = Math.min(bolNumbers.length, page_size);
        const toFetch = bolNumbers.slice(0, maxDetail);
        const detailRows = [];
        const concurrency = 5;
        for (let i = 0; i < toFetch.length; i += concurrency) {
            const chunk = toFetch.slice(i, i + concurrency);
            const results = await Promise.allSettled(chunk.map((num) => iyGet(`/bol/${encodeURIComponent(num)}`)));
            for (const r of results) {
                if (r.status !== "fulfilled")
                    continue;
                const b = r.value?.data ?? r.value;
                const arrival = b?.arrival_date ?? null;
                const addr = b?.company_address_geocode?.address_components ?? {};
                const city = addr.city ?? null;
                const state = addr.state ?? null;
                const zip = addr.zip ?? null;
                const country = addr.country ?? null;
                const destParts = [city, state, zip, country].filter(Boolean);
                const destination = destParts.length > 0
                    ? destParts.join(", ")
                    : b?.company_address ?? null;
                const origin = b?.exit_port ||
                    b?.place_of_receipt ||
                    b?.entry_port ||
                    null;
                const teu = b?.teu != null && !Number.isNaN(Number(b.teu))
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
    }
    catch (err) {
        return next(err);
    }
});
// -----------------------------------------------------------------------------
// Helper: shrink ImportYeti company JSON for Gemini
// -----------------------------------------------------------------------------
function buildGeminiCompanyProfile(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const topSuppliersSource = raw.topSuppliers ??
        raw.top_suppliers ??
        raw.suppliers ??
        [];
    const topSuppliers = Array.isArray(topSuppliersSource)
        ? topSuppliersSource.slice(0, 10)
        : [];
    const hsSource = raw.hs_codes ??
        raw.top_hs_codes ??
        raw.hsCodes ??
        [];
    const topHsCodes = Array.isArray(hsSource) ? hsSource.slice(0, 10) : [];
    const lanesSource = raw.top_lanes ??
        raw.routes ??
        raw.trade_lanes ??
        [];
    const topLanes = Array.isArray(lanesSource) ? lanesSource.slice(0, 10) : [];
    return {
        key: raw.key ?? raw.companyKey ?? null,
        name: raw.title ?? raw.name ?? null,
        website: raw.website ?? null,
        domain: raw.domain ?? null,
        phone: raw.phone ?? null,
        address: raw.company_address ?? raw.address ?? null,
        country: raw.company_country ?? raw.country ?? null,
        country_code: raw.country_code ??
            raw.company_country_code ??
            null,
        total_shipments: raw.total_shipments ??
            raw.totalShipments ??
            null,
        last_shipment_date: raw.last_shipment_date ??
            raw.most_recent_shipment ??
            raw.mostRecentShipment ??
            null,
        top_suppliers: topSuppliers,
        top_hs_codes: topHsCodes,
        top_lanes: topLanes,
    };
}
// -----------------------------------------------------------------------------
// Helper: fetch ImportYeti company profile by key or name
// -----------------------------------------------------------------------------
async function getImportYetiCompanyProfile(args) {
    const companyKey = (args.companyKey ?? "").trim();
    const name = (args.name ?? "").trim();
    if (!companyKey && !name) {
        const err = new Error("companyKey or name is required");
        err.status = 400;
        throw err;
    }
    // 1) If we have an explicit companyKey (e.g. "company/wahoo-fitness"),
    //    use that directly.
    if (companyKey) {
        const slug = companyKey.startsWith("company/")
            ? companyKey.slice("company/".length)
            : companyKey;
        const path = `/company/${encodeURIComponent(slug)}`;
        const resp = await iyGet(path);
        return resp;
    }
    // 2) Fallback: search by name, then hydrate the first hit's key.
    const searchQs = new URLSearchParams();
    searchQs.set("q", name);
    const searchPath = `/company/search?${searchQs.toString()}`;
    const searchResp = await iyGet(searchPath);
    const rows = Array.isArray(searchResp?.data) ? searchResp.data : [];
    const first = rows[0];
    if (!first) {
        const err = new Error(`No ImportYeti company found for name "${name}"`);
        err.status = 404;
        throw err;
    }
    const rawKey = first.key ||
        first.slug ||
        first.company_slug ||
        first.company_id ||
        "";
    const key = rawKey.trim();
    if (!key) {
        const err = new Error(`ImportYeti search returned a company without a usable key for "${name}"`);
        err.status = 500;
        throw err;
    }
    const slug = key.startsWith("company/") ? key.slice("company/".length) : key;
    const path = `/company/${encodeURIComponent(slug)}`;
    const profile = await iyGet(path);
    return profile;
}
// -----------------------------------------------------------------------------
// GET /public/iy/companyProfile  (raw ImportYeti profile by query param)
// -----------------------------------------------------------------------------
router.get("/companyProfile", async (req, res, next) => {
    try {
        const companyRaw = (req.query.company_id ?? req.query.company ?? "").toString() || "";
        const company = companyRaw.trim();
        if (!company) {
            return res.status(400).json({
                ok: false,
                message: "company_id or company is required",
            });
        }
        const slug = company.startsWith("company/")
            ? company.slice("company/".length)
            : company;
        const path = `/company/${encodeURIComponent(slug)}`;
        const resp = await iyGet(path);
        return res.json(resp);
    }
    catch (err) {
        return next(err);
    }
});
// -----------------------------------------------------------------------------
// POST /public/iy/companyProfile
// Used by frontend to get ImportYeti profile + Gemini enrichment.
// -----------------------------------------------------------------------------
router.post("/companyProfile", async (req, res, next) => {
    try {
        const { companyKey, name, user_goal, query } = (req.body ?? {});
        if (!companyKey && !name) {
            return res.status(400).json({
                ok: false,
                error_code: "missing_company_id",
                message: "companyKey or name is required",
            });
        }
        // 1) Fetch ImportYeti profile
        const companyProfile = await getImportYetiCompanyProfile({
            companyKey,
            name,
        });
        // 2) Build trimmed company profile for Gemini
        const geminiCompanyProfile = buildGeminiCompanyProfile(companyProfile);
        const litInput = {
            company_profile: geminiCompanyProfile,
            lit_search_context: {
                query: query ?? null,
            },
            user_goal: user_goal || "Enrich company profile for LIT Command Center",
        };
        // 3) Call Gemini agent with hard timeout so Gateway doesn't 504
        let enrichment = null;
        try {
            const timeoutMs = 12000;
            enrichment = await Promise.race([
                runGeminiAgent(litInput),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini timeout")), timeoutMs)),
            ]);
        }
        catch (agentErr) {
            // eslint-disable-next-line no-console
            console.error("POST /public/iy/companyProfile Gemini agent failed or timed out; returning base profile only", agentErr);
            enrichment = null;
        }
        return res.json({
            ok: true,
            companyProfile,
            enrichment,
        });
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error("POST /public/iy/companyProfile error", err);
        const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600
            ? err.status
            : 500;
        return res.status(status).json({
            ok: false,
            error_code: "company_profile_error",
            message: err?.message ?? "Failed to load company profile",
        });
    }
});
// -----------------------------------------------------------------------------
// GET /public/iy/companyStats
// -----------------------------------------------------------------------------
router.get("/companyStats", async (req, res, next) => {
    try {
        const companyRaw = (req.query.company ?? "").toString() || "";
        const rangeRaw = (req.query.range ?? "").toString();
        const company = companyRaw.trim();
        const range = rangeRaw.trim();
        if (!company) {
            return res
                .status(400)
                .json({ ok: false, message: "company is required" });
        }
        const slug = company.startsWith("company/")
            ? company.slice("company/".length)
            : company;
        const search = new URLSearchParams();
        if (range)
            search.set("range", range);
        const key = encodeURIComponent(slug);
        const path = `/company/${key}/stats${search.toString() ? `?${search.toString()}` : ""}`;
        const data = await iyGet(path);
        return res.json(data);
    }
    catch (err) {
        return next(err);
    }
});
// -----------------------------------------------------------------------------
// GET /public/iy/companyProfileRaw  (debug helper)
// -----------------------------------------------------------------------------
router.get("/companyProfileRaw", async (req, res, next) => {
    try {
        const rawCompany = String((req.query.company ?? req.query.company_id ?? "")).trim();
        if (!rawCompany) {
            return res
                .status(400)
                .json({ ok: false, error: "Missing company parameter" });
        }
        const slug = rawCompany.startsWith("company/")
            ? rawCompany.slice("company/".length)
            : rawCompany;
        const resp = await iyGet(`/company/${encodeURIComponent(slug)}`);
        return res.json({
            ok: true,
            company: resp,
        });
    }
    catch (err) {
        return next(err);
    }
});
export default router;
