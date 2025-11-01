import type { NextApiRequest, NextApiResponse } from 'next'

const BASE =
  process.env.TARGET_BASE_URL ||
  'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const path = req.query.path
  const suffix = Array.isArray(path) ? path.join('/') : String(path ?? '')
  const qs = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const url = `${String(BASE).replace(/\/$/, '')}/${suffix}${qs}`

  try {
    const r = await fetch(url, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: req.method && !['GET','HEAD','OPTIONS'].includes(req.method)
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
    res.status(502).json({ error: 'proxy_failed', detail: e?.message })
  }
}
