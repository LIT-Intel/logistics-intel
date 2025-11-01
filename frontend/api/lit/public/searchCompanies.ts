export default async function handler(req: any, res: any) {
  const TARGET_BASE_URL = ((globalThis as any).process?.env?.TARGET_BASE_URL) || 'https://lit-gw-2e68g4k3.uc.gateway.dev';
  const ALLOWED_ORIGIN = 'https://logistics-intel.vercel.app';
  const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-lit-proxy-token';
  const ALLOWED_METHODS = 'GET, POST, OPTIONS';

  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    // Build upstream payload, normalizing field names to backend contract
    const hs_codes = (() => {
      if (Array.isArray(body.hs_codes)) return body.hs_codes.join(',');
      if (Array.isArray(body.hs)) return body.hs.join(',');
      if (typeof body.hs_codes === 'string') return body.hs_codes;
      if (typeof body.hs === 'string') return body.hs;
      if (typeof body.hsCodes === 'string') return body.hsCodes;
      return undefined;
    })();

    const payload: Record<string, any> = {};
    const assign = (k: string, v: any) => { if (v !== undefined && v !== null && (typeof v !== 'string' || v.trim() !== '')) payload[k] = v; };
    assign('q', body.q ?? null);
    assign('mode', body.mode ?? null);
    assign('origin', body.origin ?? body.origin_country ?? null);
    assign('destination', body.destination ?? body.dest ?? body.dest_country ?? null);
    assign('origin_city', body.origin_city);
    assign('origin_state', body.origin_state);
    assign('origin_zip', body.origin_zip);
    assign('dest_city', body.dest_city);
    assign('dest_state', body.dest_state);
    assign('dest_zip', body.dest_zip);
    assign('carrier', body.carrier);
    assign('hs_codes', hs_codes);
    assign('date_start', body.date_start);
    assign('date_end', body.date_end);
    assign('min_value_usd', body.min_value_usd);
    assign('max_value_usd', body.max_value_usd);
    assign('page', body.page ?? 1);
    assign('page_size', body.page_size ?? body.pageSize ?? 24);

    const upstream = await fetch(`${String(TARGET_BASE_URL).replace(/\/$/, '')}/public/searchCompanies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: 'Upstream error', detail });
    }

    const data = await upstream.json().catch(() => ({}));
    // Adapter: accept either normalized {items,total} or raw {rows,meta}
    const items = Array.isArray((data as any)?.items)
      ? (data as any).items
      : (Array.isArray((data as any)?.rows) ? (data as any).rows : []);
    const total = typeof (data as any)?.total === 'number'
      ? (data as any).total
      : (Number((data as any)?.meta?.total ?? items.length));

    res.setHeader('x-lit-normalized', '1');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).json({ items, total });
  } catch (err: any) {
    return res.status(500).json({ error: 'Proxy failure', message: err?.message || String(err) });
  }
}
