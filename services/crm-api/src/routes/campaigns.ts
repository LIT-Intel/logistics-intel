import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getPool, audit } from '../db.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  sequence: z.any().optional(),
  settings: z.any().optional(),
  user_id: z.string().optional(),
});

const AddCompanySchema = z.object({
  company_id: z.string().min(1),
  contact_ids: z.array(z.any()).optional(),
});

r.get('/crm/campaigns', limiter, async (req, res, next) => {
  try {
    const p = await getPool();
    const result = await p.query(
      `SELECT
        c.*,
        COUNT(DISTINCT cc.company_id) as company_count
       FROM campaigns c
       LEFT JOIN campaign_companies cc ON c.id = cc.campaign_id
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT 500`
    );

    res.json({
      ok: true,
      rows: result.rows,
      total: result.rowCount
    });
  } catch (err) {
    next(err);
  }
});

r.post('/crm/campaigns', limiter, async (req, res, next) => {
  try {
    const body = CreateCampaignSchema.parse(req.body ?? {});
    const p = await getPool();

    const result = await p.query(
      `INSERT INTO campaigns(name, sequence, settings, user_id)
       VALUES($1, $2, $3, $4)
       RETURNING id, name, status, created_at`,
      [
        body.name,
        JSON.stringify(body.sequence ?? []),
        JSON.stringify(body.settings ?? {}),
        body.user_id ?? null
      ]
    );

    const campaign = result.rows[0];
    await audit(body.user_id ?? null, 'create_campaign', { id: campaign.id, name: body.name });

    res.json({ ok: true, campaign });
  } catch (err) {
    next(err);
  }
});

r.get('/crm/campaigns/:campaign_id', limiter, async (req, res, next) => {
  try {
    const campaign_id = Number(req.params.campaign_id);
    if (!Number.isFinite(campaign_id)) {
      return res.status(400).json({ error: 'invalid_campaign_id' });
    }

    const p = await getPool();
    const campaign = await p.query(
      `SELECT * FROM campaigns WHERE id = $1`,
      [campaign_id]
    );

    if (campaign.rowCount === 0) {
      return res.status(404).json({ error: 'campaign_not_found' });
    }

    const companies = await p.query(
      `SELECT * FROM campaign_companies WHERE campaign_id = $1 ORDER BY added_at DESC`,
      [campaign_id]
    );

    res.json({
      ok: true,
      campaign: campaign.rows[0],
      companies: companies.rows
    });
  } catch (err) {
    next(err);
  }
});

r.post('/crm/campaigns/:campaign_id/addCompany', limiter, async (req, res, next) => {
  try {
    const campaign_id = Number(req.params.campaign_id);
    if (!Number.isFinite(campaign_id)) {
      return res.status(400).json({ error: 'invalid_campaign_id' });
    }

    const body = AddCompanySchema.parse(req.body ?? {});
    const p = await getPool();

    const result = await p.query(
      `INSERT INTO campaign_companies(campaign_id, company_id, contact_ids, status)
       VALUES($1, $2, $3, 'pending')
       ON CONFLICT (campaign_id, company_id) DO UPDATE
       SET contact_ids = EXCLUDED.contact_ids
       RETURNING id`,
      [
        campaign_id,
        body.company_id,
        JSON.stringify(body.contact_ids ?? [])
      ]
    );

    await audit(null, 'add_company_to_campaign', {
      campaign_id,
      company_id: body.company_id
    });

    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

export default r;
