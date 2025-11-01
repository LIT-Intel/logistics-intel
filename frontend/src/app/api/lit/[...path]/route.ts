import { NextRequest, NextResponse } from 'next/server';

const BASE = process.env.TARGET_BASE_URL?.replace(/\/$/, '') || 'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward('GET', req, params.path, req);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward('POST', req, params.path, req);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-LIT-Proxy-Token',
  };
}

async function forward(method: 'GET' | 'POST', req: NextRequest, path: string[], raw: NextRequest) {
  const target = `${BASE}/${path.join('/')}${req.nextUrl.search}`;
  const response = await fetch(target, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? await raw.text() : undefined,
    cache: 'no-store',
  });

  const text = await response.text();
  const headers = corsHeaders();
  const contentType = response.headers.get('content-type') ?? 'application/json';

  return new NextResponse(text, {
    status: response.status,
    headers: {
      ...headers,
      'content-type': contentType,
    },
  });
}
