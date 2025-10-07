// Local types to avoid @vercel/node types requirement
type Req = any;
type Res = any;

// Simple email relay for PDF attachments.
// Expects JSON: { data: string (data:application/pdf;base64,...), filename?: string, to: string, subject?: string, text?: string, html?: string }
// Uses RESEND_API_KEY if available. If not configured, returns 202 to avoid blocking demo flows.
export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const dataUri: string = body.data || '';
    const to: string = body.to || '';
    const filename: string = body.filename || 'company.pdf';
    const subject: string = body.subject || 'Company PDF';
    const text: string = body.text || 'Attached is the requested PDF.';
    const html: string | undefined = body.html;

    if (!dataUri || !dataUri.startsWith('data:application/pdf')) {
      return res.status(400).json({ error: 'invalid_payload', detail: 'Expected data URI for PDF' });
    }
    if (!to) {
      return res.status(400).json({ error: 'invalid_payload', detail: 'Missing recipient' });
    }

    const base64 = dataUri.split(',')[1] || '';
    if (!base64) return res.status(400).json({ error: 'invalid_payload', detail: 'Missing base64' });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // No provider configured; accept for demo
      return res.status(202).json({ ok: true, queued: true, provider: 'none' });
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'no-reply@lit-intel.dev',
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        html: html || `<p>${text}</p>`,
        attachments: [
          { filename, content: base64 },
        ],
      }),
    });

    if (!emailRes.ok) {
      const t = await emailRes.text().catch(() => '');
      return res.status(502).json({ error: 'email_failed', detail: t });
    }
    const j = await emailRes.json().catch(() => ({}));
    return res.status(200).json({ ok: true, id: j?.id || null });
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error', detail: String(e?.message || e) });
  }
}

