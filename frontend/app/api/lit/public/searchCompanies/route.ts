import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_BASE = process.env.NEXT_PUBLIC_API_BASE as string;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const payload = {
      q: body.q ?? null,
      origin: body.origin ?? null,
      destination: body.destination ?? null,
      hs: body.hs ?? null,
      mode: body.mode ?? null,
      page: body.page ?? 1,
      pageSize: body.pageSize ?? 24,
    };

    if (!GATEWAY_BASE) {
      return NextResponse.json({ error: 'GATEWAY base not configured (NEXT_PUBLIC_API_BASE)' }, { status: 500 });
    }

    const upstream = await fetch(`${GATEWAY_BASE.replace(/\/$/, '')}/public/searchCompanies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return NextResponse.json({ error: 'Upstream error', detail }, { status: upstream.status });
    }

    const data = await upstream.json(); // upstream: { rows, meta }
    const items = Array.isArray(data?.rows) ? data.rows : [];
    const total = data?.meta?.total ?? 0;

    // FE contract per PRD:
    return NextResponse.json({ items, total });
  } catch (err: any) {
    return NextResponse.json({ error: 'Proxy failure', message: err?.message || String(err) }, { status: 500 });
  }
}
