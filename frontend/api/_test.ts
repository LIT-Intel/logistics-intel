export default function handler(_req: any, res: any) {
  res.setHeader('x-lit-test', 'ok');
  res.status(200).json({ ok: true });
}
