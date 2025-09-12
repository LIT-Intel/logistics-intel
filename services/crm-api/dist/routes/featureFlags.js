import { Router } from 'express';
import { getPool } from '../db.js';
const r = Router();
r.get('/crm/feature-flags', async (_req, res, next) => {
    try {
        const p = await getPool();
        const rows = await p.query(`SELECT key, enabled, plan FROM feature_flags ORDER BY key ASC`);
        res.json({ flags: rows.rows });
    }
    catch (err) {
        next(err);
    }
});
export default r;
