import { CompanyLite, ShipmentLite } from '@/types/importyeti';

const toISO = (value?: string | null) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const match = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(trimmed);
  if (!match) {
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
};

export function normalizeIYCompany(row: any): CompanyLite {
  const key = typeof row?.key === 'string' ? row.key : '';
  const companyId = key.replace(/^company\//, '') || key || row?.slug || row?.id || '';
  const totalShipments = Number(row?.totalShipments ?? 0);
  return {
    company_id: companyId,
    name: row?.title ?? row?.name ?? 'Unknown Company',
    source: 'importyeti',
    address: row?.address ?? null,
    country_code: row?.countryCode ?? null,
    kpis: {
      shipments_12m: Number.isFinite(totalShipments) ? totalShipments : 0,
      last_activity: toISO(row?.mostRecentShipment),
    },
    extras: {
      top_suppliers: Array.isArray(row?.topSuppliers) ? row.topSuppliers : [],
    },
  };
}

export function normalizeIYShipment(row: any): ShipmentLite {
  const teuNum = row?.TEU != null ? Number(row.TEU) : null;
  const qtyNum = row?.Quantity != null ? Number(row.Quantity) : null;
  const costNum = row?.shipping_cost != null ? Number(row.shipping_cost) : null;

  return {
    date: toISO(row?.date_formatted) ?? '',
    bol: row?.Bill_of_Lading ?? '',
    mbl: row?.Master_Bill_of_Lading ?? null,
    hs_code: row?.HS_Code ?? null,
    teu: Number.isFinite(teuNum) ? teuNum : null,
    qty: Number.isFinite(qtyNum) ? qtyNum : null,
    qty_unit: row?.Quantity_Unit ?? null,
    shipper_name: row?.Shipper_Name ?? null,
    consignee_name: row?.Consignee_Name ?? null,
    description: row?.Product_Description ?? null,
    lcl: typeof row?.lcl === 'boolean' ? row.lcl : null,
    shipping_cost_usd: Number.isFinite(costNum) ? costNum : (row?.shipping_cost === 0 ? 0 : null),
    origin_port: row?.origin_port ?? row?.Origin_Port ?? row?.Port_of_Lading ?? null,
    destination_port: row?.destination_port ?? row?.Destination_Port ?? row?.Port_of_Unlading ?? null,
    origin_country_code: row?.origin_country_code ?? row?.Origin_Country_Code ?? row?.origin_country ?? null,
    dest_country_code: row?.dest_country_code ?? row?.Destination_Country_Code ?? row?.dest_country ?? null,
    mode: row?.mode ?? row?.Mode ?? row?.transport_mode ?? null,
  };
}
