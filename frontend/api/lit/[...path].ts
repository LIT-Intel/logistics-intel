// Prefer env; fallback to known Gateway hostname used across the app
const GATEWAY = ((globalThis as any).process?.env?.LIT_API_BASE) || 'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev';

export default async function handler(req: any, res: any) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    const parts = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
    const suffix = parts.join('/');
    const url = `${GATEWAY}/${suffix}${req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;

    // CORS: allow browser to call this serverless function
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (method === 'OPTIONS') {
      return res.status(204).send('');
    }

    // Debug logging
    const bodyPreview = !/^(GET|HEAD)$/i.test(method) ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})) : undefined;
    console.log('[lit-proxy] begin', { target: GATEWAY, method, suffix, url, body: bodyPreview?.slice?.(0, 400) });

    // Clone headers; drop hop-by-hop / host
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (!v) continue;
      const key = k.toLowerCase();
      if (['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authorization', 'proxy-authenticate', 'te', 'trailer'].includes(key)) continue;
      if (Array.isArray(v)) headers.set(k, v.join(', ')); else headers.set(k, String(v));
    }
    // Ensure JSON content-type on POST/PUT/PATCH when body present
    if (req.method && /^(POST|PUT|PATCH)$/i.test(req.method) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const init: RequestInit = {
      method,
      headers,
      body: !/^(GET|HEAD)$/i.test(method) ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})) : undefined,
    };

    const upstream = await fetch(url, init);
    // Pass through status and body
    const text = await upstream.text();
    console.log('[lit-proxy] end', { status: upstream.status, ct: upstream.headers.get('content-type') });

    // Mirror content-type if present
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);

    return res.status(upstream.status).send(text);
  } catch (err: any) {
    return res.status(502).json({ error: 'proxy_error', message: err?.message || 'unknown' });
  }
}
