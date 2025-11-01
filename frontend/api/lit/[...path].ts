import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleAuth } from 'google-auth-library';

const BASE = process.env.TARGET_BASE_URL?.replace(/\/$/, '') || 'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev';
const AUDIENCE = process.env.RUN_AUDIENCE || BASE;
const ALLOWED_METHODS = 'GET,POST,OPTIONS';
const ALLOWED_HEADERS = 'authorization, content-type, x-lit-proxy-token';

const auth = new GoogleAuth();

async function getAuthHeader(): Promise<string> {
  if (!AUDIENCE) {
    throw new Error('RUN_AUDIENCE (or TARGET_BASE_URL) is not configured');
  }
  const client = await auth.getIdTokenClient(AUDIENCE);
  const headers = await client.getRequestHeaders();
  return headers['Authorization'] || headers['authorization'] || '';
}

function buildTargetUrl(req: VercelRequest, path: string[]): string {
  const joined = path.join('/');
  const search = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return `${BASE}/${joined}${search}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const pathParam = req.query.path;
  const pathSegments = Array.isArray(pathParam)
    ? pathParam
    : (typeof pathParam === 'string' ? [pathParam] : []);

  if (!pathSegments.length) {
    res.status(400).json({ error: 'Missing target path' });
    return;
  }

  try {
    const authorization = await getAuthHeader();
    const url = buildTargetUrl(req, pathSegments);
    const init: RequestInit = {
      method: req.method,
      headers: {
        'content-type': 'application/json',
        authorization,
      },
      cache: 'no-store',
    };

    if (req.method === 'POST') {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    }

    const upstream = await fetch(url, init);
    const text = await upstream.text();

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-length') return;
      res.setHeader(key, value);
    });
    res.send(text);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Proxy failure' });
  }
}
