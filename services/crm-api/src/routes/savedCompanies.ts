import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getPool, audit } from '../db.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

const SaveCompanySchema = z.object({
  company_id: z.string().min(1),
  stage: z.string().optional(),
  provider: z.string().optional(),
  payload: z.any(),
  user_id: z.string().optional(),
});

r.post('/crm/saveCompany', limiter, async (req, res, next) => {
  try {
    const body = SaveCompanySchema.parse(req.body ?? {});
    const p = await getPool();

    const result = await p.query(
      `INSERT INTO saved_companies(company_id, stage, provider, payload, user_id)
       VALUES($1, $2, $3, $4, $5)
       ON CONFLICT (company_id) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = now()
       RETURNING id, company_id, created_at`,
      [
        body.company_id,
        body.stage ?? 'prospect',
        body.provider ?? 'importyeti',
        JSON.stringify(body.payload ?? {}),
        body.user_id ?? null
      ]
    );

    const saved = result.rows[0];
    await audit(body.user_id ?? null, 'save_company', { company_id: body.company_id });

    res.json({
      ok: true,
      id: saved.id,
      company_id: saved.company_id,
      created_at: saved.created_at
    });
  } catch (err) {
    next(err);
  }
});

r.get('/crm/savedCompanies', limiter, async (req, res, next) => {
  try {
    const stage = req.query.stage?.toString() ?? 'prospect';
    const user_id = req.query.user_id?.toString();
    const p = await getPool();

    let query = `SELECT * FROM saved_companies WHERE stage = $1`;
    const params: any[] = [stage];

    if (user_id) {
      query += ` AND user_id = $2`;
      params.push(user_id);
    }

    query += ` ORDER BY created_at DESC LIMIT 500`;

    const result = await p.query(query, params);

    const rows = result.rows.map(row => ({
      company: {
        company_id: row.company_id,
        name: row.payload?.shipper?.title || row.payload?.shipper?.name || row.company_id,
        source: row.provider,
        ...row.payload?.shipper,
      },
      shipments: row.payload?.shipments || [],
      created_at: row.created_at,
    }));

    res.json({ ok: true, rows, total: result.rowCount });
  } catch (err) {
    next(err);
  }
});

r.get('/crm/companies/:company_id', limiter, async (req, res, next) => {
  try {
    const company_id = req.params.company_id;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });

    const p = await getPool();
    const result = await p.query(
      `SELECT * FROM saved_companies WHERE company_id = $1 LIMIT 1`,
      [company_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'not_found' });
    }

    const row = result.rows[0];
    res.json({
      ok: true,
      company: {
        company_id: row.company_id,
        name: row.payload?.shipper?.title || row.payload?.shipper?.name || row.company_id,
        source: row.provider,
        ...row.payload?.shipper,
      },
      profile: row.payload?.profile || null,
      shipments: row.payload?.shipments || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  } catch (err) {
    next(err);
  }
});

r.post('/crm/companies/:company_id/enrichContacts', limiter, async (req, res, next) => {
  try {
    const company_id = req.params.company_id;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });

    await audit(null, 'enrich_contacts_requested', { company_id });

    res.json({
      ok: true,
      message: 'Contact enrichment queued',
      contacts: []
    });
  } catch (err) {
    next(err);
  }
});

export default r;
