import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getPool, audit } from '../db.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

const CreateRfpSchema = z.object({
  company_id: z.string().min(1),
  name: z.string().optional(),
  lanes: z.any().optional(),
  user_id: z.string().optional(),
});

const GenerateRfpSchema = z.object({
  company_id: z.string().min(1),
  lanes: z.array(z.any()),
  owner: z.string().optional(),
  template: z.string().optional(),
  user_id: z.string().optional(),
});

r.get('/rfp/company/:company_id/context', limiter, async (req, res, next) => {
  try {
    const company_id = req.params.company_id;
    if (!company_id) {
      return res.status(400).json({ error: 'company_id required' });
    }

    const p = await getPool();

    const company = await p.query(
      `SELECT * FROM saved_companies WHERE company_id = $1 LIMIT 1`,
      [company_id]
    );

    const rfps = await p.query(
      `SELECT * FROM rfps WHERE company_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [company_id]
    );

    if (company.rowCount === 0) {
      return res.json({
        ok: true,
        company: null,
        shipments: [],
        rfps: rfps.rows,
      });
    }

    const row = company.rows[0];
    res.json({
      ok: true,
      company: {
        company_id: row.company_id,
        name: row.payload?.shipper?.title || row.company_id,
        ...row.payload?.shipper,
      },
      profile: row.payload?.profile || null,
      shipments: row.payload?.shipments || [],
      rfps: rfps.rows,
    });
  } catch (err) {
    next(err);
  }
});

r.post('/rfp/generate', limiter, async (req, res, next) => {
  try {
    const body = GenerateRfpSchema.parse(req.body ?? {});
    const p = await getPool();

    const result = await p.query(
      `INSERT INTO rfps(company_id, name, lanes, status, user_id)
       VALUES($1, $2, $3, 'processing', $4)
       RETURNING id, company_id, status, created_at`,
      [
        body.company_id,
        `RFP for ${body.company_id}`,
        JSON.stringify(body.lanes),
        body.user_id ?? null
      ]
    );

    const rfp = result.rows[0];
    await audit(body.user_id ?? null, 'generate_rfp', {
      id: rfp.id,
      company_id: body.company_id,
      lane_count: body.lanes.length
    });

    setTimeout(async () => {
      try {
        await p.query(
          `UPDATE rfps SET status = 'complete', files = $1, updated_at = now() WHERE id = $2`,
          [JSON.stringify([{ type: 'xlsx', url: 'https://example.com/rfp.xlsx' }]), rfp.id]
        );
      } catch (err) {
        console.error('Failed to update RFP status:', err);
      }
    }, 2000);

    res.json({
      ok: true,
      job_id: rfp.id,
      status: 'processing',
      message: 'RFP generation started'
    });
  } catch (err) {
    next(err);
  }
});

r.post('/rfp/workspace', limiter, async (req, res, next) => {
  try {
    const body = CreateRfpSchema.parse(req.body ?? {});
    const p = await getPool();

    const result = await p.query(
      `INSERT INTO rfps(company_id, name, lanes, status, user_id)
       VALUES($1, $2, $3, 'draft', $4)
       RETURNING id, company_id, status, created_at`,
      [
        body.company_id,
        body.name || `RFP Workspace ${Date.now()}`,
        JSON.stringify(body.lanes ?? []),
        body.user_id ?? null
      ]
    );

    const rfp = result.rows[0];
    await audit(body.user_id ?? null, 'create_rfp_workspace', {
      id: rfp.id,
      company_id: body.company_id
    });

    res.json({ ok: true, rfp });
  } catch (err) {
    next(err);
  }
});

r.get('/rfp/:rfp_id', limiter, async (req, res, next) => {
  try {
    const rfp_id = Number(req.params.rfp_id);
    if (!Number.isFinite(rfp_id)) {
      return res.status(400).json({ error: 'invalid_rfp_id' });
    }

    const p = await getPool();
    const result = await p.query(
      `SELECT * FROM rfps WHERE id = $1`,
      [rfp_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'rfp_not_found' });
    }

    res.json({ ok: true, rfp: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default r;
