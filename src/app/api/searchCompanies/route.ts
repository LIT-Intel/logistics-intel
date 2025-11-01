import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RunResponse<T = unknown> = {
  status?: number;
  data: T;
};

async function callRun<T = unknown>(path: string, body: unknown): Promise<RunResponse<T>> {
  const RUN_BASE = process.env.SEARCH_BASE_URL;
  if (!RUN_BASE) {
    throw new Error('SEARCH_BASE_URL is not set');
  }

  const rawCredentials = process.env.GCP_SA_KEY;
  if (!rawCredentials) {
    throw new Error('GCP_SA_KEY is not set');
  }

  const { GoogleAuth } = await import('google-auth-library');
  const credentials = JSON.parse(rawCredentials);
  const auth = new GoogleAuth({ credentials });
  const client = await auth.getIdTokenClient(RUN_BASE);

  const url = `${RUN_BASE}${path}`;
  const response = await client.request<T>({
    url,
    method: 'POST',
    data: body,
    headers: {
      'content-type': 'application/json',
    },
  });

  return {
    status: response.status,
    data: response.data,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { status, data } = await callRun('/public/searchCompanies', body);
    return NextResponse.json(data, { status: status ?? 200 });
  } catch (err: any) {
    const message = err?.message ?? 'proxy_error';
    const status = err?.response?.status ?? 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
