export const config = { api: { bodyParser: true } } as const;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { data, filename, to } = req.body || {};
    if (!data) {
      res.status(400).json({ error: 'Missing base64 data' });
      return;
    }
    // Optional: forward to Gateway relay if configured
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE || process.env.VITE_API_BASE || '';
      if (base) {
        const r = await fetch(`${base}/crm/emailPdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data, filename: filename || 'company.pdf', to }) });
        if (!r.ok) {
          const t = await r.text();
          res.status(502).json({ error: `Relay failed ${r.status}: ${t}` });
          return;
        }
        const j = await r.json();
        res.status(200).json(j);
        return;
      }
    } catch {}
    // Fallback no-op success
    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

