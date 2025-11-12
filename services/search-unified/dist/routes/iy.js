import { Router } from 'express';
const router = Router();
router.post('/searchShippers', async (req, res) => {
    const { q = '', page = 1, pageSize = 10 } = (req.body || {});
    return res.json({ ok: true, meta: { q, page, pageSize }, rows: [], total: 0 });
});
router.get('/companyBols', async (_req, res) => {
    return res.json({ ok: true, rows: [], total: 0 });
});
export default router;
