import { expect, it, vi, afterEach } from 'vitest';

const mockClient = {
  request: vi.fn().mockResolvedValue({ status: 200, data: { rows: [] } }),
} as any;

const mockAuth = {
  getIdTokenClient: vi.fn().mockResolvedValue(mockClient),
} as any;

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(() => mockAuth),
}));

afterEach(() => {
  mockAuth.getIdTokenClient.mockClear();
  mockClient.request.mockClear();
});

it('server proxy posts to Cloud Run /public/searchCompanies', async () => {
  const originalBase = process.env.SEARCH_BASE_URL;
  const originalKey = process.env.GCP_SA_KEY;

  process.env.SEARCH_BASE_URL = 'https://search-unified-gxezx63yea-uc.a.run.app';
  process.env.GCP_SA_KEY = JSON.stringify({
    type: 'service_account',
    client_email: 'test@test',
    private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
  });

  const { default: handler } = await import('../api/searchCompanies');

  const send = vi.fn();
  const setHeader = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({
    json: vi.fn(),
    setHeader,
    send,
  });

  const res: any = {
    status,
    setHeader,
    json: vi.fn(),
  };

  await handler({ method: 'POST', body: { q: null, limit: 1, offset: 0 } } as any, res);

  expect(mockAuth.getIdTokenClient).toHaveBeenCalledWith(process.env.SEARCH_BASE_URL);
  expect(mockClient.request).toHaveBeenCalled();
  const call = mockClient.request.mock.calls[0][0];
  expect(call.method).toBe('POST');
  expect(call.url).toBe('https://search-unified-gxezx63yea-uc.a.run.app/public/searchCompanies');

  process.env.SEARCH_BASE_URL = originalBase;
  process.env.GCP_SA_KEY = originalKey;
});
