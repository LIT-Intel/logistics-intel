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
      q: body.q ?? null,
      origin: body.origin ?? null,
      destination: body.destination ?? null,
      hs: body.hs ?? null,
      mode: body.mode ?? null,   // 'air' | 'ocean' | null
      page: body.page ?? 1,
      pageSize: body.pageSize ?? 24,
    };

    const upstream = await fetch(`${String(TARGET_BASE_URL).replace(/\/$/, '')}/public/searchCompanies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: 'Upstream error', detail });
    }

    const data = await upstream.json(); // { rows, meta }
    const items = Array.isArray(data?.rows) ? data.rows : [];
    const total = Number(data?.meta?.total ?? 0);

    res.setHeader('x-lit-normalized', '1');
    return res.status(200).json({ items, total });
  } catch (err: any) {
    return res.status(500).json({ error: 'Proxy failure', message: err?.message || String(err) });
  }
}
