export default async function handler(_req: any, res: any) {
  try {
    console.log('[hello] hit /api/lit/hello');
    res.setHeader('content-type', 'application/json');
    return res.status(200).send(JSON.stringify({ ok: true, service: 'lit-proxy', ts: Date.now() }));
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
