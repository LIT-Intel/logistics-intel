import { Router } from 'express';
import { z } from 'zod';
import { getPool, audit } from '../db.js';
const r = Router();
const LogOutreach = z.object({
    companyId: z.number().int(),
    contactId: z.number().int().optional(),
    channel: z.enum(['email', 'linkedin']),
    subject: z.string().optional(),
    snippet: z.string().optional(),
    status: z.string().min(1),
    meta: z.any().optional(),
});
r.post('/crm/outreach', async (req, res, next) => {
    try {
        const body = LogOutreach.parse(req.body ?? {});
        const p = await getPool();
        const sql = `INSERT INTO outreach_history(company_id, contact_id, channel, subject, snippet, status, meta)
                 VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`;
        const args = [body.companyId, body.contactId ?? null, body.channel, body.subject ?? null, body.snippet ?? null, body.status, body.meta ?? null];
        const ins = await p.query(sql, args);
        const id = ins.rows[0].id;
        await audit(null, 'log_outreach', { id, ...body });
        res.json({ id });
    }
    catch (err) {
        next(err);
    }
});
export default r;
