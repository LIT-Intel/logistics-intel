const express = require('express');
const app = express();
app.use(express.json());

// health
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// expected by Gateway
app.post('/public/widgets/tariff/calc', (req, res) => {
  const { hsCode, origin, destination, valueUsd } = req.body || {};
  res.json({
    ok: true,
    hsCode: hsCode || null,
    origin: origin || null,
    destination: destination || null,
    valueUsd: valueUsd ?? null,
    tariffs: [{ code: hsCode || 'unknown', rate: 0, basis: 'placeholder' }]
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`widgets-tariff listening on ${port}`));
