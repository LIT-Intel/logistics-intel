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

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const subpath = Array.isArray((req as any).query?.path) ? (req as any).query.path.join('/') : String((req as any).query?.path || '');
    const url = `${TARGET_BASE_URL.replace(/\/$/, '')}/${subpath}`;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (req.headers && req.headers['authorization']) headers['authorization'] = String(req.headers['authorization']);

    const init: any = { method: req.method, headers };
    if (req.method === 'POST') init.body = JSON.stringify((req as any).body || {});

    const upstream = await fetch(url, init);
    const text = await upstream.text();
    const ct = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.status(upstream.status);
    res.setHeader('content-type', ct);
    return res.send(text);
  } catch (err: any) {
    return res.status(502).json({ error: 'Upstream failure', detail: err?.message || String(err) });
  }
}
