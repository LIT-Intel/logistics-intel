import { Router, Request, Response } from 'express';
const router = Router();

router.post('/searchShippers', async (req: Request, res: Response) => {
  const { q = '', page = 1, pageSize = 10 } = (req.body || {});
  return res.json({ ok: true, meta: { q, page, pageSize }, rows: [], total: 0 });
});

router.get('/companyBols', async (_req: Request, res: Response) => {
  return res.json({ ok: true, rows: [], total: 0 });
});

export default router;
