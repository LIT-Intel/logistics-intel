import { Router } from 'express';
import { getPool } from '../db.js';

const r = Router();

r.get('/admin/audit', async (req, res, next) => {
  try {
    const n = Math.max(1, Math.min(1000, Number(req.query.n || 100)));
    const p = await getPool();
    const rows = await p.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`, [n]);
    res.json({ items: rows.rows });
  } catch (err) { next(err); }
});

export default r;
