const express = require('express');
const app = express();

app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.status(200).send('agent-runner: ok');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Pub/Sub push target (and manual curl target)
app.post('/commands', (req, res) => {
  try {
    const payload = req.body || {};
    console.log('COMMAND_RECEIVED', JSON.stringify(payload));
    // simple ping handler
    if (payload.action === 'ping') {
      return res.json({ ok: true, pong: Date.now(), note: payload.note || null });
    }
    // default ack (so Pub/Sub doesn't retry forever)
    return res.json({ ok: true, received: true });
  } catch (err) {
    console.error('COMMAND_ERROR', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`agent-runner listening on ${PORT}`);
});
