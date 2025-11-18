// Use global fetch in Node 20, but avoid TS lib issues by going via globalThis
const gFetch = globalThis.fetch;
function toTrimmedString(v) {
    if (typeof v === "string")
        return v.trim();
    if (typeof v === "number" || typeof v === "boolean")
        return String(v).trim();
    return "";
}
function clampPage(v) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 1)
        return 1;
    return Math.floor(n);
}
function clampPageSize(v) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0)
        return 10;
    const capped = Math.min(Math.floor(n), 50);
    return capped > 0 ? capped : 10;
}
function clampLimit(v) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0)
        return 25;
    const clamped = Math.min(Math.floor(n), 100);
    return clamped >= 1 ? clamped : 25;
}
function clampOffset(v) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0)
        return 0;
    const floored = Math.floor(n);
    return floored >= 0 ? floored : 0;
}
function mapRow(row, idx) {
    const title = toTrimmedString(row.title);
    const keyRaw = row.key ?? (title || `row_${idx}`);
    const topSuppliers = Array.isArray(row.topSuppliers)
        ? row.topSuppliers
            .map((s) => toTrimmedString(s))
            .filter((s) => s.length > 0)
        : [];
    return {
        key: String(keyRaw),
        title,
        countryCode: toTrimmedString(row.countryCode),
        address: toTrimmedString(row.address),
        totalShipments: typeof row.totalShipments === "number" ? row.totalShipments : Number(row.totalShipments ?? 0) || undefined,
        mostRecentShipment: toTrimmedString(row.mostRecentShipment),
        topSuppliers,
    };
}
export async function iySearch(q, page, pageSize) {
    const term = toTrimmedString(q);
    const safePage = clampPage(page);
    const safePageSize = clampPageSize(pageSize);
    // Short-circuit on blank query
    if (!term) {
        const meta = {
            q: "",
            page: 1,
            pageSize: safePageSize,
            total: 0,
        };
        return { ok: true, meta, rows: [], total: 0 };
    }
    const apiKey = process.env.IYApiKey || process.env.IY_API_KEY || process.env.IY_API_KEY_PUBLIC;
    if (!apiKey || !apiKey.trim()) {
        const err = new Error("ImportYeti API key not configured");
        err.code = "importyeti_config_missing";
        err.status = 500;
        throw err;
    }
    const baseUrl = process.env.IY_DMA_SEARCH_URL || "https://data.importyeti.com/v1.0/company/search";
    const offset = (safePage - 1) * safePageSize;
    const url = new URL(baseUrl);
    url.searchParams.set("name", term);
    url.searchParams.set("page_size", String(safePageSize));
    url.searchParams.set("offset", String(offset));
    console.log(JSON.stringify({
        level: "info",
        message: "[iy] searchShippers fetch start",
        url: url.toString(),
        q: term,
        page: safePage,
        pageSize: safePageSize,
    }));
    let json;
    let status = 0;
    try {
        const response = await gFetch(url.toString(), {
            method: "GET",
            headers: {
                accept: "application/json",
                IYApiKey: apiKey,
            },
        });
        status = response.status;
        if (!response.ok) {
            const err = new Error(`ImportYeti search failed with status ${response.status}`);
            err.code = "importyeti_upstream_failed";
            err.status = 502;
            throw err;
        }
        json = (await response.json());
    }
    catch (e) {
        console.error(JSON.stringify({
            level: "error",
            message: "[iy] searchShippers fetch error",
            status,
            error: e?.message ?? String(e),
        }));
        if (e && !e.code) {
            e.code = "importyeti_upstream_failed";
        }
        throw e;
    }
    const rows = Array.isArray(json?.data) ? json.data.map(mapRow) : [];
    const total = rows.length;
    const meta = {
        q: term,
        page: safePage,
        pageSize: safePageSize,
        total,
        creditsRemaining: json?.creditsRemaining,
        executionTime: json?.executionTime,
        requestCost: json?.requestCost,
    };
    console.log(JSON.stringify({
        level: "info",
        message: "[iy] searchShippers fetch done",
        q: term,
        page: safePage,
        pageSize: safePageSize,
        total,
        creditsRemaining: json?.creditsRemaining,
        requestCost: json?.requestCost,
    }));
    return { ok: true, meta, rows, total };
}
export async function iyCompanyBols(companyKey, limit, offset) {
    const key = toTrimmedString(companyKey);
    if (!key) {
        const err = new Error("ImportYeti companyKey is required");
        err.code = "importyeti_company_key_required";
        err.status = 400;
        throw err;
    }
    const safeLimit = clampLimit(limit);
    const safeOffset = clampOffset(offset);
    const apiKey = process.env.IYApiKey || process.env.IY_API_KEY || process.env.IY_API_KEY_PUBLIC;
    if (!apiKey || !apiKey.trim()) {
        const err = new Error("ImportYeti API key not configured");
        err.code = "importyeti_config_missing";
        err.status = 500;
        throw err;
    }
    const baseUrl = process.env.IY_DMA_BASE_URL || "https://data.importyeti.com";
    const url = new URL(`/v1.0/company/${key}/bols`, baseUrl);
    url.searchParams.set("limit", String(safeLimit));
    url.searchParams.set("offset", String(safeOffset));
    console.log(JSON.stringify({
        level: "info",
        message: "[iy] companyBols start",
        companyKey: key,
        limit: safeLimit,
        offset: safeOffset,
    }));
    let status = 0;
    let json;
    try {
        const response = await gFetch(url.toString(), {
            method: "GET",
            headers: {
                accept: "application/json",
                IYApiKey: apiKey,
            },
        });
        status = response.status;
        if (!response.ok) {
            const err = new Error(`ImportYeti companyBols failed with status ${response.status}`);
            err.code = "importyeti_upstream_failed";
            err.status = response.status === 404 ? 404 : 502;
            throw err;
        }
        json = (await response.json());
    }
    catch (e) {
        console.error(JSON.stringify({
            level: "error",
            message: "[iy] companyBols error",
            companyKey: key,
            limit: safeLimit,
            offset: safeOffset,
            status,
            error: e?.message ?? String(e),
        }));
        if (e && !e.code) {
            e.code = "importyeti_upstream_failed";
        }
        throw e;
    }
    const rows = Array.isArray(json?.data) ? json.data : [];
    const metaTotal = typeof json?.total === "number"
        ? json.total
        : typeof json?.meta?.total === "number"
            ? json.meta.total
            : undefined;
    const total = typeof metaTotal === "number" && Number.isFinite(metaTotal) ? Math.floor(metaTotal) : rows.length;
    console.log(JSON.stringify({
        level: "info",
        message: "[iy] companyBols ok",
        companyKey: key,
        limit: safeLimit,
        offset: safeOffset,
        total,
        requestCost: json?.requestCost,
        creditsRemaining: json?.creditsRemaining,
    }));
    return {
        ok: true,
        rows,
        total,
        meta: {
            companyKey: key,
            limit: safeLimit,
            offset: safeOffset,
            requestCost: json?.requestCost,
            creditsRemaining: json?.creditsRemaining,
            executionTime: json?.executionTime,
        },
    };
}
