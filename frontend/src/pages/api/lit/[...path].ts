import type { NextApiRequest, NextApiResponse } from 'next'

const BASE = process.env.TARGET_BASE_URL || 'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path = [] } = req.query
  const search = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const url = `${BASE}/${Array.isArray(path) ? path.join('/') : path}${search}`

  const init: RequestInit = {
    method: req.method,
    headers: { 'content-type': 'application/json' },
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body ?? {}) : undefined,
    cache: 'no-store',
  }

  try {
    const response = await fetch(url, init)
    const text = await response.text()
    res
      .status(response.status)
      .setHeader('content-type', response.headers.get('content-type') ?? 'application/json')
      .send(text)
  } catch (error: any) {
    res.status(502).json({ error: 'proxy_failed', detail: error?.message })
  }
}
