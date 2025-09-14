import { Router } from 'express';
import { z } from 'zod';
import { getPool, audit } from '../db.js';
const r = Router();
const CreateCompany = z.object({
    name: z.string().min(1),
    website: z.string().url().optional(),
    plan: z.enum(['Free', 'Pro', 'Enterprise']).optional(),
    external_ref: z.string().optional(),
});
r.post('/crm/companies', async (req, res, next) => {
    try {
        const body = CreateCompany.parse(req.body ?? {});
        const p = await getPool();
        const upsert = await p.query(`INSERT INTO companies(name, website, plan, external_ref)
       VALUES($1,$2,COALESCE($3,'Free'),$4)
       ON CONFLICT (name) DO UPDATE SET website = EXCLUDED.website, plan = EXCLUDED.plan, external_ref = COALESCE(companies.external_ref, EXCLUDED.external_ref)
       RETURNING id`, [body.name, body.website ?? null, body.plan ?? null, body.external_ref ?? null]).catch(async (_err) => {
            // If (name) is not unique, fallback to simple insert and ignore conflict requirement
            const ins = await p.query(`INSERT INTO companies(name, website, plan, external_ref) VALUES($1,$2,COALESCE($3,'Free'),$4) RETURNING id`, [body.name, body.website ?? null, body.plan ?? null, body.external_ref ?? null]);
            return ins;
        });
        const id = upsert.rows[0].id;
        await audit(null, 'create_company', { id, ...body });
        res.json({ id });
    }
    catch (err) {
        next(err);
    }
});
r.get('/crm/companies/:id', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id))
            return res.status(400).json({ error: 'bad_id' });
        const p = await getPool();
        const company = await p.query(`SELECT * FROM companies WHERE id=$1`, [id]);
        if (company.rowCount === 0)
            return res.status(404).json({ error: 'not_found' });
        const contacts = await p.query(`SELECT * FROM contacts WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200`, [id]);
        const outreach = await p.query(`SELECT * FROM outreach_history WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200`, [id]);
        res.json({ company: company.rows[0], contacts: contacts.rows, outreach: outreach.rows });
    }
    catch (err) {
        next(err);
    }
});
export default r;
