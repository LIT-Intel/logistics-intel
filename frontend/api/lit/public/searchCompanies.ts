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
    const payload = {
      q: String(body.q ?? '').trim(),
      limit: Math.max(1, Math.min(100, Number(body.limit ?? body.page_size ?? body.pageSize ?? 20))),
      offset: Math.max(0, Number(body.offset ?? ((body.page ? Number(body.page) - 1 : 0) * Number(body.page_size ?? body.pageSize ?? 20))))
    };
    const upstream = await fetch(`${String(TARGET_BASE_URL).replace(/\/$/, '')}/public/searchCompanies2`, {
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
