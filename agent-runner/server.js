const express = require('express');
const app = express();
app.use(express.json());

// health check
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// Pub/Sub push endpoint
app.post('/pubsub/push', (req, res) => {
  const msg = req.body && req.body.message;
  const decoded = (() => {
    try {
      const data = msg?.data ? Buffer.from(msg.data, 'base64').toString('utf8') : '{}';
      return JSON.parse(data);
    } catch (e) {
      return { raw: msg?.data || null };
    }
  })();
  console.log('Received Pub/Sub push:', { id: msg?.messageId, attributes: msg?.attributes, data: decoded });
  // Ack
  res.status(204).send();
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`agent listening on ${PORT}`));
