// Pure diff function: given previous + new parsed_summary, return the set
// of alert rows that should be inserted (one per (user, company, alert_type)
// — caller fans out across all users who saved this company).
//
// Smart-default thresholds per spec:
//   - volume:   ≥0.20 OR ≥5 absolute new shipments. severity=high if ≥0.50, else warning
//   - shipment: new BOLs since last refresh
//   - lane:     new route in top_routes OR existing route +≥50% w/w
//   - baseline: previous_parsed_summary is NULL — emit ONE info row, no diff alerts

export type AlertCandidate = {
  alert_type: "volume" | "shipment" | "lane" | "baseline";
  severity: "info" | "warning" | "high";
  payload: Record<string, unknown>;
};

export interface LiveCompanyContext {
  pod: string | null;
  final_dest: string | null;
  next_arrival_date: string | null;
  drayage: {
    total_est_usd: number;
    total_low_usd: number;
    total_high_usd: number;
    container_count: number;
  } | null;
}

export function computeAlertCandidates(
  prev: Record<string, any> | null,
  next: Record<string, any>,
  liveContext?: LiveCompanyContext,
): AlertCandidate[] {
  if (!prev || Object.keys(prev).length === 0) {
    return [{
      alert_type: "baseline",
      severity: "info",
      payload: {
        company_name: next.company_name ?? null,
        total_shipments: numeric(next.total_shipments),
        total_teu: numeric(next.total_teu),
        last_shipment_date: next.last_shipment_date ?? null,
      },
    }];
  }

  const candidates: AlertCandidate[] = [];

  // 1. Volume alert.
  const prevShip = numeric(prev.total_shipments) ?? 0;
  const nextShip = numeric(next.total_shipments) ?? 0;
  const absDelta = nextShip - prevShip;
  const pctDelta = prevShip > 0 ? absDelta / prevShip : 0;
  if (absDelta >= 5 || pctDelta >= 0.20) {
    const volumePayload: Record<string, unknown> = {
      before: prevShip,
      after: nextShip,
      abs_delta: absDelta,
      pct_delta: pctDelta,
      company_name: next.company_name ?? null,
    };

    if (liveContext) {
      volumePayload.pod = liveContext.pod;
      volumePayload.final_dest = liveContext.final_dest;
      volumePayload.next_arrival_date = liveContext.next_arrival_date;
      if (liveContext.drayage) {
        volumePayload.drayage_est_usd = liveContext.drayage.total_est_usd;
        volumePayload.drayage_est_low_usd = liveContext.drayage.total_low_usd;
        volumePayload.drayage_est_high_usd = liveContext.drayage.total_high_usd;
        volumePayload.drayage_container_count = liveContext.drayage.container_count;
      }
    }

    candidates.push({
      alert_type: "volume",
      severity: Math.abs(pctDelta) >= 0.50 ? "high" : "warning",
      payload: volumePayload,
    });
  }

  // 2. Shipment alert — new BOLs since last refresh.
  const prev12m = numeric(prev.shipments_last_12m) ?? 0;
  const next12m = numeric(next.shipments_last_12m) ?? 0;
  const prevLastDate = prev.last_shipment_date ?? null;
  const nextLastDate = next.last_shipment_date ?? null;
  if (next12m > prev12m && nextLastDate && (!prevLastDate || nextLastDate > prevLastDate)) {
    candidates.push({
      alert_type: "shipment",
      severity: "info",
      payload: {
        before_12m: prev12m,
        after_12m: next12m,
        last_shipment_date: nextLastDate,
        company_name: next.company_name ?? null,
      },
    });
  }

  // 3. Lane alert — new route OR +≥50% surge on existing route.
  const prevRoutes = routeMap(prev.top_routes);
  const nextRoutes = routeMap(next.top_routes);
  const newRoutes: string[] = [];
  const surgedRoutes: Array<{ route: string; before: number; after: number }> = [];
  for (const [route, nextCount] of nextRoutes) {
    const prevCount = prevRoutes.get(route);
    if (prevCount === undefined) {
      newRoutes.push(route);
    } else if (prevCount > 0 && (nextCount - prevCount) / prevCount >= 0.5) {
      surgedRoutes.push({ route, before: prevCount, after: nextCount });
    }
  }
  if (newRoutes.length > 0) {
    candidates.push({
      alert_type: "lane",
      severity: "info",
      payload: { kind: "new_route", routes: newRoutes.slice(0, 5), company_name: next.company_name ?? null },
    });
  }
  if (surgedRoutes.length > 0) {
    candidates.push({
      alert_type: "lane",
      severity: "warning",
      payload: { kind: "lane_volume_surge", surges: surgedRoutes.slice(0, 5), company_name: next.company_name ?? null },
    });
  }

  return candidates;
}

function numeric(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}

function routeMap(routes: unknown): Map<string, number> {
  const m = new Map<string, number>();
  if (!Array.isArray(routes)) return m;
  for (const r of routes) {
    if (!r || typeof r !== "object") continue;
    const key = String((r as any).route ?? "").trim();
    const count = numeric((r as any).shipments) ?? 0;
    if (key) m.set(key, count);
  }
  return m;
}
