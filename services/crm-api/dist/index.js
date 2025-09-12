import express from 'express';
import health from './routes/health.js';
import companies from './routes/companies.js';
import contacts from './routes/contacts.js';
import outreach from './routes/outreach.js';
import featureFlags from './routes/featureFlags.js';
import admin from './routes/admin.js';
import { initSchema } from './db.js';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
// Optional API key gate
const API_KEY = process.env.API_KEY;
if (API_KEY) {
    app.use((req, res, next) => {
        const key = req.header('x-api-key') || req.header('api-key');
        if (key !== API_KEY)
            return res.status(401).json({ error: 'unauthorized' });
        next();
    });
}
app.use(health);
app.use(companies);
app.use(contacts);
app.use(outreach);
app.use(featureFlags);
app.use(admin);
app.use((err, _req, res, _next) => {
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
