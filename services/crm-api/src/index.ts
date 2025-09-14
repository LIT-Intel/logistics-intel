import express from 'express';
import bodyParser from 'body-parser';
import publicRouter from './routes/public.js';
import health from './routes/health.js';
import companies from './routes/companies.js';
import contacts from './routes/contacts.js';
import outreach from './routes/outreach.js';
import featureFlags from './routes/featureFlags.js';
import admin from './routes/admin.js';
import { initSchema } from './db.js';

const app = express();
app.disable('x-powered-by');
app.use(bodyParser.json({ limit: '1mb' }));

// CORS for Gateway/browser
app.use((req: any, res: any, next: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Optional API key gate
const API_KEY = process.env.API_KEY;
if (API_KEY) {
  app.use((req, res, next) => {
    const key = req.header('x-api-key') || req.header('api-key');
    if (key !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
    next();
  });
}

app.use(health);
app.use(companies);
app.use(contacts);
app.use(outreach);
app.use(featureFlags);
app.use(admin);

// Public proxy routes (to Gateway)
app.use('/api/public', publicRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error', detail: String(err?.message || err) });
});

const port = process.env.PORT || 8080;
initSchema()
  .then(() => app.listen(port, () => console.log(`crm-api listening on :${port}`)))
  .catch((err) => {
    console.error('schema init failed', err);
    process.exit(1);
  });

