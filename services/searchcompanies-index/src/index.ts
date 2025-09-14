import express from 'express';
import { normalizeSearchCompaniesInput } from './normalize.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// OPTIONS for CORS handled by Gateway typically, but respond OK
app.options('/public/searchCompanies', (_req, res) => res.status(204).end());

app.post('/public/searchCompanies', async (req, res) => {
  try {
    const normalized = normalizeSearchCompaniesInput(req.body ?? {});
    // NOTE: Replace below with real query execution. For T1 we just echo.
    res.json({ ok: true, normalized });
  } catch (err: any) {
    if (err?.status === 422) {
      return res.status(422).json({ error: 'invalid_input', fieldErrors: err.fieldErrors });
    }
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// health
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`searchcompanies-index listening on :${port}`));

