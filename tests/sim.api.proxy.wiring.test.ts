import { expect, it, vi, afterEach } from 'vitest';

const { mockAuth, mockClient, mockAuthConstructor } = vi.hoisted(() => {
  const mockClient = {
    request: vi.fn().mockResolvedValue({ status: 200, data: { rows: [] } }),
  };

  const mockAuth = {
    getIdTokenClient: vi.fn().mockResolvedValue(mockClient),
  };

  const mockAuthConstructor = vi.fn();

  return { mockAuth, mockClient, mockAuthConstructor };
});

const jsonResponseMock = vi.fn((data: any, init?: { status?: number }) => ({
  status: init?.status ?? 200,
  json: async () => data,
}));

vi.mock('next/server', () => ({
  NextResponse: { json: jsonResponseMock },
}));

vi.mock('google-auth-library', () => {
  class GoogleAuthMock {
    constructor() {
      mockAuthConstructor();
      return mockAuth;
    }
  }
  return { GoogleAuth: GoogleAuthMock };
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('API proxy forwards to Cloud Run /public/searchCompanies', async () => {
  const originalBase = process.env.SEARCH_BASE_URL;
  const originalKey = process.env.GCP_SA_KEY;

  process.env.SEARCH_BASE_URL = 'https://search-unified-gxezx63yea-uc.a.run.app';
  process.env.GCP_SA_KEY = JSON.stringify({
    type: 'service_account',
    client_email: 'test@test',
    private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
  });

  const mod = await import('../src/app/api/searchCompanies/route');
  const request = new Request('http://localhost/api/searchCompanies', {
    method: 'POST',
    body: JSON.stringify({ q: null, limit: 1, offset: 0 }),
  });

  const response = (await (mod as any).POST(request)) as Response;
  await response.json();

  expect(mockAuthConstructor).toHaveBeenCalled();
  expect(mockClient.request).toHaveBeenCalled();
  const call = mockClient.request.mock.calls[0][0];
  expect(call.method).toBe('POST');
  expect(call.url).toBe('https://search-unified-gxezx63yea-uc.a.run.app/public/searchCompanies');
  expect(response.status).toBe(200);
  expect(jsonResponseMock).toHaveBeenCalled();

  process.env.SEARCH_BASE_URL = originalBase;
  process.env.GCP_SA_KEY = originalKey;
});
