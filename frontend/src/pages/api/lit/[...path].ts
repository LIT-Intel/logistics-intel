import type { NextApiRequest, NextApiResponse } from 'next'

const RAW_BASE =
  process.env.TARGET_BASE_URL ||
  process.env.API_GATEWAY_BASE ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.VITE_API_BASE ||
  ''

const NORMALIZED_BASE = RAW_BASE.trim().replace(/\/$/, '')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!NORMALIZED_BASE) {
    res.status(500).json({ error: 'missing_target_base' })
    return
  }

  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path ?? '')
  const qs = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const url = `${NORMALIZED_BASE}/${path}${qs}`

  try {
    const r = await fetch(url, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body:
        req.method && !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? '')
          ? JSON.stringify(req.body ?? {})
          : undefined,
      cache: 'no-store',
    })
    const text = await r.text()
    res
      .status(r.status)
      .setHeader('content-type', r.headers.get('content-type') ?? 'application/json')
      .send(text)
  } catch (e: any) {
    res.status(502).json({ error: 'proxy_failed', detail: e?.message ?? 'unknown error' })
  }
}
