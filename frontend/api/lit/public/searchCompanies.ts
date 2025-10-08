export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const body = (typeof req.body === 'string') ? JSON.parse(req.body || '{}') : (req.body || {});
    const payload = {
      q: body.q ?? null,
      origin: body.origin ?? null,
      destination: body.destination ?? null,
      hs: body.hs ?? null,
      mode: body.mode ?? null,
      page: body.page ?? (typeof body.offset === 'number' && typeof body.limit === 'number' ? Math.floor(body.offset / Math.max(1, body.limit)) + 1 : 1),
      pageSize: body.pageSize ?? body.limit ?? 24,
    } as const;

    const base = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || process.env.GATEWAY_BASE;
    if (!base) {
      return res.status(500).json({ error: 'GATEWAY base not configured (NEXT_PUBLIC_API_BASE)' });
    }

    const upstream = await fetch(`${base.replace(/\/$/, '')}/public/searchCompanies`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(()=> '');
      return res.status(upstream.status).json({ error: 'Upstream error', detail });
    }
    const data = await upstream.json();
    const items = Array.isArray(data?.rows) ? data.rows : [];
    const total = (data?.meta && typeof data.meta.total === 'number') ? data.meta.total : (Array.isArray(items) ? items.length : 0);
    res.setHeader('content-type', 'application/json');
    return res.status(200).send(JSON.stringify({ items, total }));
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
