import { iyCompanyBols } from './api';

export interface CompanyKpiData {
  teu: number;
  fclCount: number;
  lclCount: number;
  trend: 'up' | 'flat' | 'down';
  topOriginPorts: string[];
  topDestinationPorts: string[];
  monthlyVolume: Array<{
    month: string;
    fcl: number;
    lcl: number;
    total: number;
  }>;
  lastShipmentDate: string | null;
}

export async function fetchCompanyKpis(
  companyKey: string,
  signal?: AbortSignal
): Promise<CompanyKpiData | null> {
  try {
    const now = new Date();
    const endDate = now.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });

    const response = await iyCompanyBols(
      {
        company_id: companyKey,
        start_date: '01/01/2019',
        end_date: endDate,
        limit: 100,
        offset: 0,
      },
      signal
    );

    console.log('[KPI] BOL Response:', {
      ok: response.ok,
      rowCount: response.rows?.length || 0,
      sample: response.rows?.[0]
    });

    if (!response.ok || !response.rows || response.rows.length === 0) {
      console.warn('[KPI] No BOL data available');
      return null;
    }

    const shipments = response.rows;
    const kpis = computeKpisFromBols(shipments);
    console.log('[KPI] Computed KPIs:', kpis);
    return kpis;
  } catch (error) {
    console.error('Failed to fetch company KPIs:', error);
    return null;
  }
}

function computeKpisFromBols(shipments: any[]): CompanyKpiData {
  let totalTeu = 0;
  let fclCount = 0;
  let lclCount = 0;
  const originPortCounts = new Map<string, number>();
  const destPortCounts = new Map<string, number>();
  const monthlyData = new Map<string, { fcl: number; lcl: number }>();

  const now = new Date();
  const last12Months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    last12Months.push(key);
    monthlyData.set(key, { fcl: 0, lcl: 0 });
  }

  let latestDate: Date | null = null;

  for (const shipment of shipments) {
    const teu = typeof shipment.teu === 'number' && shipment.teu !== undefined ? shipment.teu : 0;

    if (teu > 0) {
      totalTeu += teu;
    }

    const isFcl = teu >= 1;
    if (isFcl) {
      fclCount++;
    } else if (teu > 0 || !shipment.teu) {
      lclCount++;
    }

    if (shipment.origin) {
      const origin = String(shipment.origin);
      originPortCounts.set(origin, (originPortCounts.get(origin) || 0) + 1);
    }

    if (shipment.destination) {
      const dest = String(shipment.destination);
      destPortCounts.set(dest, (destPortCounts.get(dest) || 0) + 1);
    }

    const shippedOn = shipment.shipped_on || shipment.arrival_date || shipment.date;
    if (shippedOn) {
      const shipDate = new Date(shippedOn);
      if (!isNaN(shipDate.getTime())) {
        if (!latestDate || shipDate > latestDate) {
          latestDate = shipDate;
        }

        const monthKey = `${shipDate.getFullYear()}-${String(shipDate.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyData.has(monthKey)) {
          const data = monthlyData.get(monthKey)!;
          if (isFcl) {
            data.fcl += teu;
          } else {
            data.lcl += teu;
          }
        }
      }
    }
  }

  const topOrigins = Array.from(originPortCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([port]) => port);

  const topDestinations = Array.from(destPortCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([port]) => port);

  const monthlyVolume = last12Months.map((key) => {
    const data = monthlyData.get(key)!;
    const monthDate = new Date(key + '-01');
    return {
      month: monthDate.toLocaleString('en-US', { month: 'short' }),
      fcl: data.fcl,
      lcl: data.lcl,
      total: data.fcl + data.lcl,
    };
  });

  const recentVolumes = monthlyVolume.slice(-3).map((m) => m.total);
  let trend: 'up' | 'flat' | 'down' = 'flat';
  if (recentVolumes.length >= 2) {
    const avg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const last = recentVolumes[recentVolumes.length - 1];
    if (last > avg * 1.1) {
      trend = 'up';
    } else if (last < avg * 0.9) {
      trend = 'down';
    }
  }

  return {
    teu: Math.round(totalTeu),
    fclCount,
    lclCount,
    trend,
    topOriginPorts: topOrigins,
    topDestinationPorts: topDestinations,
    monthlyVolume,
    lastShipmentDate: latestDate ? latestDate.toISOString().split('T')[0] : null,
  };
}
