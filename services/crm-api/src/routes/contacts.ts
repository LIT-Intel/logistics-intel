import { Router } from 'express';
import { z } from 'zod';
import { getPool, audit } from '../db.js';

const r = Router();

const CreateContact = z.object({
  companyId: z.number().int(),
  fullName: z.string().min(1),
  title: z.string().optional(),
  email: z.string().email().optional(),
  linkedin: z.string().url().optional(),
  phone: z.string().optional(),
  source: z.string().optional(),
});

r.post('/crm/contacts', async (req, res, next) => {
  try {
    const body = CreateContact.parse(req.body ?? {});
    const p = await getPool();
    const sql = `INSERT INTO contacts(company_id, full_name, title, email, linkedin, phone, source)
                 VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`;
    const args = [body.companyId, body.fullName, body.title ?? null, body.email ?? null, body.linkedin ?? null, body.phone ?? null, body.source ?? null];
    const ins = await p.query(sql, args);
    const id = ins.rows[0].id;
    await audit(null, 'create_contact', { id, ...body });
    res.json({ id });
  } catch (err) { next(err); }
});

export default r;
