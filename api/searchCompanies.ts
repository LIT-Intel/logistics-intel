import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleAuth } from 'google-auth-library';

const RUN_BASE = process.env.SEARCH_BASE_URL?.replace(/\/$/, '');

async function getClient() {
  if (!RUN_BASE) {
    throw new Error('SEARCH_BASE_URL is not set');
  }
  const rawKey = process.env.GCP_SA_KEY;
  if (!rawKey) {
    throw new Error('GCP_SA_KEY is not set');
  }
  const credentials = JSON.parse(rawKey);
  const auth = new GoogleAuth({ credentials });
  return auth.getIdTokenClient(RUN_BASE);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const client = await getClient();
    const url = `${RUN_BASE}/public/searchCompanies`;
    const response = await client.request({
      url,
      method: 'POST',
      data: req.body ?? {},
      headers: { 'content-type': 'application/json' },
    });
    res
      .status(response.status ?? 200)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('content-type', 'application/json')
      .send(JSON.stringify(response.data));
  } catch (error: any) {
    res
      .status(502)
      .json({ error: 'proxy_error', detail: error?.message ?? 'Unknown error' });
  }
}
