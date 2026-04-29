import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getPool, audit } from '../db.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

// DEPRECATED 2026-04-28. This route used to insert into a separate
// `saved_companies` Postgres table with NO plan-limit enforcement, which
// let free-trial users save unlimited companies. The canonical save flow
// now goes through the gated Supabase Edge Function `save-company` which
// writes to `lit_saved_companies` after running `check_usage_limit`.
//
// The existing `saved_companies` rows are preserved for migration/backfill
// purposes (the GET routes below still read them) but no new writes are
// accepted here. Callers should be migrated to the canonical helper at
// frontend/src/lib/saveCompany.ts -> saveCompany().
r.post('/crm/saveCompany', limiter, async (_req, res) => {
  res.status(410).json({
    ok: false,
    code: 'ENDPOINT_DEPRECATED',
    message:
      'This endpoint is deprecated. Saves now route through the gated Supabase save-company Edge Function. Please update the client to use saveCompany() from @/lib/saveCompany.',
    migrate_to: 'supabase/functions/save-company',
  });
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
