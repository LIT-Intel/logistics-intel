export const config = { api: { bodyParser: false } } as const;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const buffers: Uint8Array[] = [];
    for await (const chunk of req) buffers.push(chunk as Uint8Array);
    const file = Buffer.concat(buffers);
    if (!file || file.length === 0) {
      res.status(400).json({ error: 'Missing file' });
      return;
    }
    // TODO: parse multipart and send via Resend/Graph
    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

