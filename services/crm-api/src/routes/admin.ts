import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getPool } from '../db.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });

r.get('/admin/audit', limiter, async (req, res, next) => {
  try {
    const n = Math.max(1, Math.min(1000, Number(req.query.n || 100)));
    const p = await getPool();
    const rows = await p.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`, [n]);
    res.json({ items: rows.rows });
  } catch (err) { next(err); }
});

export default r;
