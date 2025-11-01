import { expect, it, vi, afterEach } from 'vitest';

const { mockAuth, mockClient, GoogleAuthMock } = vi.hoisted(() => {
  const mockClient = {
    request: vi.fn().mockResolvedValue({ status: 200, data: { rows: [] } }),
  };

  const mockAuth = {
    getIdTokenClient: vi.fn().mockResolvedValue(mockClient),
  };

  const GoogleAuthMock = vi.fn().mockImplementation(() => mockAuth);

  return { mockAuth, mockClient, GoogleAuthMock };
});

vi.mock('google-auth-library', () => ({
  GoogleAuth: GoogleAuthMock,
}));

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

  expect(GoogleAuthMock).toHaveBeenCalled();
  expect(mockAuth.getIdTokenClient).toHaveBeenCalledWith(process.env.SEARCH_BASE_URL);
  expect(mockClient.request).toHaveBeenCalled();
  const call = mockClient.request.mock.calls[0][0];
  expect(call.method).toBe('POST');
  expect(call.url).toBe('https://search-unified-gxezx63yea-uc.a.run.app/public/searchCompanies');
  expect(response.status).toBe(200);

  process.env.SEARCH_BASE_URL = originalBase;
  process.env.GCP_SA_KEY = originalKey;
});
