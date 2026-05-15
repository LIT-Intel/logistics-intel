import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PulseLiveData, PulseTrackedShipment, PulseDrayageEstimate } from './pulseLiveTypes';

// Normalize the source company key — bundle?.identity?.key arrives as
// "company/amazon-services" but lit_unified_shipments.company_id is the
// bare slug "amazon-services". Strip the prefix so the query matches.
function normalizeCompanyId(key: string | null): string | null {
  if (!key) return null;
  return key.startsWith('company/') ? key.slice('company/'.length) : key;
}

export function usePulseLiveData(sourceCompanyKey: string | null): PulseLiveData {
  const [shipments, setShipments] = useState<PulseTrackedShipment[]>([]);
  const [allBols, setAllBols] = useState<any[]>([]);
  const [drayage, setDrayage] = useState<PulseDrayageEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const companyId = normalizeCompanyId(sourceCompanyKey);
    if (!companyId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: ships, error: shipErr } = await supabase
        .from('lit_unified_shipments')
        .select(`
          bol_number, scac, carrier_name, origin_port, destination_port,
          origin_country, destination_country,
          dest_city, dest_state, container_count, container_type, teu, lcl, load_type,
          hs_code, product_description, shipper_name, consignee_name,
          tracking_status, tracking_eta, tracking_arrival_actual,
          tracking_last_event_code, tracking_last_event_at, bol_date, raw_payload
        `)
        .eq('company_id', companyId)
        .order('bol_date', { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (shipErr) { setError(shipErr.message); setLoading(false); return; }

      const { data: dray } = await supabase
        .from('lit_drayage_estimates')
        .select('bol_number, destination_city, destination_state, miles, containers_eq, est_cost_usd, est_cost_low_usd, est_cost_high_usd')
        .eq('source_company_key', companyId);
      if (cancelled) return;

      setShipments((ships || []).map((s: any) => ({
        ...s,
        carrier: deriveCarrierName(s.scac),
      })));
      // Raw BOL rows for the "All Shipments" table — keep the row payload
      // intact so the BolPreviewTable getBol* helpers can fall back through
      // their many field-name aliases. Cap at 100 rows for the table view.
      setAllBols((ships || []).slice(0, 100));
      setDrayage(dray || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sourceCompanyKey]);

  const carrierMix = computeCarrierMix(shipments);
  return { shipments, allBols, drayage, carrierMix, loading, error };
}

function deriveCarrierName(scac: string | null): string | null {
  if (!scac) return null;
  const s = scac.toUpperCase();
  if (['MAEU', 'SUDU', 'SAFM', 'MCPU'].includes(s)) return 'Maersk';
  if (['HLCU', 'HLXU'].includes(s)) return 'Hapag-Lloyd';
  return s;
}

function computeCarrierMix(ships: PulseTrackedShipment[]) {
  const map = new Map<string, { bol_count: number; container_count: number; tracked: boolean }>();
  for (const s of ships) {
    const carrier = s.carrier || 'Unknown';
    const tracked = s.tracking_status === 'tracked';
    const prev = map.get(carrier) || { bol_count: 0, container_count: 0, tracked };
    prev.bol_count += 1;
    prev.container_count += s.container_count || 0;
    prev.tracked = prev.tracked || tracked;
    map.set(carrier, prev);
  }
  return Array.from(map.entries()).map(([carrier, v]) => ({ carrier, ...v }));
}
