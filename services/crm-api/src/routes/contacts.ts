import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

const LUSHA_BASE = process.env.LUSHA_BASE || 'https://api.lusha.co';
const LUSHA_KEY  = process.env.LUSHA_API_KEY || '';

// Map Lusha response -> neutral contact shape
function mapContactsFromLusha(payload: any): any[] {
  const list = Array.isArray(payload?.data) ? payload.data : [];
  return list.map((p: any, i: number) => ({
    id: p?.id ?? i,
    name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null,
    title: p?.job_title ?? null,
    department: p?.department ?? null,
    seniority: p?.seniority ?? null,
    email: p?.email ?? null,
    phone: p?.phone ?? null,
    location: p?.location ?? p?.country ?? null,
  }));
}

router.get('/public/contacts', async (req, res) => {
  try {
    const q = (req.query.q as string) || null;
    const company_id = (req.query.company_id as string) || null;
    const limit = Number(req.query.limit ?? 25);
    const offset = Number(req.query.offset ?? 0);

    // If Lusha key present, try provider call by company name (q)
    if (LUSHA_KEY && (q || company_id)) {
      // Minimal example—adapt to your Lusha plan’s search API
      const body = {
        company_name: q || undefined,
        limit, offset,
      } as any;
      const resp = await fetch(`${LUSHA_BASE}/enrichment/v1/person/search`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${LUSHA_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        const json: any = await resp.json();
        return res.json({ rows: mapContactsFromLusha(json), total: (json && (json as any).total) ? (json as any).total : undefined });
      }
      // fall through to empty if provider rejects
    }

    // Default: return empty list (UI handles gracefully)
    return res.json({ rows: [] });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'contacts failed' });
  }
});

export default router;
