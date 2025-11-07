/**
 * ==========================================================================
 * IMPORTYETI PROXY CONTRACT
 * --------------------------------------------------------------------------
 * These endpoints are consumed by the production Shippers search toggle.
 * Keep the payload shape in sync with frontend expectations before changing
 * any mapping logic, and always run the manual search + drawer smoke tests.
 * ==========================================================================
 */

import { Router } from "express";
import fetch from "node-fetch";

const API_BASE = "https://api.importyeti.com/v1";

const r = Router();

const toDMY = (value?: string | null) => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

r.post("/searchShippers", async (req, res) => {
  try {
    const apiKey = process.env.IMPORTYETI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "IMPORTYETI_API_KEY missing" });
    }

    const { keyword, limit = 20, offset = 0 } = req.body ?? {};
    if (!keyword || typeof keyword !== "string") {
      return res.status(400).json({ ok: false, error: "keyword (string) is required" });
    }

    const upstream = await fetch(`${API_BASE}/companies/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ q: keyword, limit, offset }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(502).json({ ok: false, error: "ImportYeti upstream error", status: upstream.status, body: text });
    }

    const payload = await upstream.json();
    const results = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.rows)
        ? payload.rows
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

      const rows = results.map((company: any) => {
        const name = company?.name ?? company?.company_name ?? "Unknown";
        const key =
          company?.key ??
          company?.slug ??
          company?.company_url ??
          company?.id ??
          `company/${String(name).trim().toLowerCase().replace(/\s+/g, "-")}`;
        const mostRecent =
          company?.mostRecentShipment ??
          company?.last_shipment_date ??
          company?.updated_at ??
          company?.lastShipmentDate;

        return {
          title: name,
          countryCode: company?.country ?? company?.countryCode ?? company?.country_code ?? undefined,
          address: company?.address ?? company?.street ?? undefined,
          totalShipments: company?.total_shipments ?? company?.shipments_12m ?? company?.shipments_last_12_months ?? null,
          mostRecentShipment: typeof mostRecent === "string" ? (mostRecent.includes("/") ? mostRecent : toDMY(mostRecent)) : null,
          key,
          topSuppliers: Array.isArray(company?.topSuppliers) ? company.topSuppliers : [],
        };
      });

    return res.json({ ok: true, rows, total: payload?.total ?? rows.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? "server error" });
  }
});

r.post("/companyBols", async (req, res) => {
  try {
    const apiKey = process.env.IMPORTYETI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "IMPORTYETI_API_KEY missing" });
    }

    const { companyKey, limit = 50, offset = 0 } = req.body ?? {};
    if (!companyKey || typeof companyKey !== "string") {
      return res.status(400).json({ ok: false, error: "companyKey (string) is required" });
    }

    const upstream = await fetch(`${API_BASE}/shipments/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ companyKey, limit, offset }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(502).json({ ok: false, error: "ImportYeti upstream error", status: upstream.status, body: text });
    }

    const payload = await upstream.json();
    const results = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.rows)
        ? payload.rows
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

      const rows = results.map((row: any) => {
        const dmy =
          row?.date_formatted ??
          row?.dateFormatted ??
          row?.date ??
          (typeof row?.shipment_date === "string" ? toDMY(row.shipment_date) : null);

        return {
          date_formatted: typeof dmy === "string" ? dmy : null,
          Bill_of_Lading: row?.Bill_of_Lading ?? row?.bill_of_lading ?? row?.bol ?? "",
          Master_Bill_of_Lading: row?.Master_Bill_of_Lading ?? row?.master_bill_of_lading ?? row?.mbl ?? null,
          HS_Code: row?.HS_Code ?? row?.hs_code ?? row?.HSCode ?? null,
          TEU: row?.TEU ?? row?.teu ?? null,
          Quantity: row?.Quantity ?? row?.quantity ?? null,
          Quantity_Unit: row?.Quantity_Unit ?? row?.quantity_unit ?? null,
          Shipper_Name: row?.Shipper_Name ?? row?.shipper ?? row?.shipper_name ?? null,
          Consignee_Name: row?.Consignee_Name ?? row?.consignee ?? row?.consignee_name ?? null,
          Product_Description: row?.Product_Description ?? row?.product_description ?? row?.description ?? null,
          lcl: typeof row?.lcl === "boolean" ? row.lcl : null,
          shipping_cost: row?.shipping_cost ?? row?.Shipping_Cost ?? null,
        };
      });

    return res.json({ ok: true, rows });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? "server error" });
  }
});

export default r;
