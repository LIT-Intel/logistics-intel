import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PulseLiveData, PulseTrackedShipment, PulseDrayageEstimate } from './pulseLiveTypes';

export function usePulseLiveData(sourceCompanyKey: string | null): PulseLiveData {
  const [shipments, setShipments] = useState<PulseTrackedShipment[]>([]);
  const [drayage, setDrayage] = useState<PulseDrayageEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceCompanyKey) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: ships, error: shipErr } = await supabase
        .from('lit_unified_shipments')
        .select(`
          bol_number, scac, origin_port, destination_port,
          dest_city, dest_state, container_count, container_type, lcl, hs_code,
          tracking_status, tracking_eta, tracking_arrival_actual,
          tracking_last_event_code, tracking_last_event_at, bol_date
        `)
        .eq('company_id', sourceCompanyKey)
        .order('bol_date', { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (shipErr) { setError(shipErr.message); setLoading(false); return; }

      const { data: dray } = await supabase
        .from('lit_drayage_estimates')
        .select('bol_number, destination_city, destination_state, miles, containers_eq, est_cost_usd, est_cost_low_usd, est_cost_high_usd')
        .eq('source_company_key', sourceCompanyKey);
      if (cancelled) return;

      setShipments((ships || []).map((s: any) => ({
        ...s,
        carrier: deriveCarrierName(s.scac),
      })));
      setDrayage(dray || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sourceCompanyKey]);

  const carrierMix = computeCarrierMix(shipments);
  return { shipments, drayage, carrierMix, loading, error };
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
