import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getPool } from '../db.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });

r.get('/crm/feature-flags', limiter, async (_req, res, next) => {
  try {
    const p = await getPool();
    const rows = await p.query(`SELECT key, enabled, plan FROM feature_flags ORDER BY key ASC`);
    res.json({ flags: rows.rows });
  } catch (err) { next(err); }
});

export default r;
