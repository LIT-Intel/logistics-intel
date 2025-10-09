// frontend/api/lit/public/searchCompanies.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const GATEWAY_BASE = process.env.NEXT_PUBLIC_API_BASE as string;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      mode: body.mode ?? null,
      page: body.page ?? 1,
      pageSize: body.pageSize ?? 24,
    };

    const upstream = await fetch(`${GATEWAY_BASE}/public/searchCompanies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return res.status(upstream.status).json({ error: 'Upstream error', detail });
    }

    const data = await upstream.json(); // upstream: { rows, meta }
    const items = Array.isArray(data?.rows) ? data.rows : [];
    const total = data?.meta?.total ?? 0;

    // FE contract per PRD:
    return res.status(200).json({ items, total });
  } catch (err: any) {
    return res.status(500).json({ error: 'Proxy failure', message: err?.message || String(err) });
  }
}
