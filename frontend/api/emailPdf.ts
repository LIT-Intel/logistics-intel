export default async function handler(req: any, res: any) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const from = ((globalThis as any).process?.env?.EMAIL_FROM) ?? 'no-reply@lit-intel.com';
    const to = body?.to ?? null;
    const pdfBase64 = body?.pdfBase64 ?? null;

    if (!to || !pdfBase64) {
      return res.status(400).json({ ok: false, error: 'Missing "to" or "pdfBase64"' });
    }

    // TODO: send email via provider (Resend/SendGrid/etc.)
    // await sendEmail({ from, to, attachmentPdfBase64: pdfBase64 });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
