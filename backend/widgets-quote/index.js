const express = require('express');
const app = express();
app.use(express.json());

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.post('/public/widgets/quote/generate', (req, res) => {
  const { companyId, lanes = [], notes } = req.body || {};
  const quoteId = `q_${Math.random().toString(36).slice(2,8)}`;
  res.json({
    ok: true,
    quoteId,
    companyId: companyId ?? null,
    lanes,
    notes: notes ?? null,
    totals: { currency: 'USD', amount: 0 },
    items: lanes.map((l, i) => ({ line: i+1, mode: l.mode, origin: l.origin, destination: l.destination, priceUsd: 0 }))
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`widgets-quote listening on ${port}`));
