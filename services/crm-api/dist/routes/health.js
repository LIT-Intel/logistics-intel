import { Router } from 'express';
const r = Router();
r.get('/health', (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));
export default r;
