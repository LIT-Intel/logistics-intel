import { computeAlertCandidates } from "./alert_diff.ts";

const baseline = computeAlertCandidates(null, { company_name: "Acme", total_shipments: 10 });
console.assert(baseline.length === 1 && baseline[0].alert_type === "baseline", "baseline case");

const noChange = computeAlertCandidates(
  { total_shipments: 10, shipments_last_12m: 10, top_routes: [{ route: "China → US", shipments: 5 }] },
  { total_shipments: 10, shipments_last_12m: 10, top_routes: [{ route: "China → US", shipments: 5 }] },
);
console.assert(noChange.length === 0, "no-change case");

const volSurge = computeAlertCandidates(
  { total_shipments: 100, shipments_last_12m: 50, top_routes: [] },
  { total_shipments: 160, shipments_last_12m: 50, top_routes: [] },
);
console.assert(volSurge.some(c => c.alert_type === "volume" && c.severity === "high"), "volume high");

const newLane = computeAlertCandidates(
  { total_shipments: 10, top_routes: [{ route: "China → US", shipments: 5 }] },
  { total_shipments: 10, top_routes: [{ route: "China → US", shipments: 5 }, { route: "Vietnam → US", shipments: 3 }] },
);
console.assert(newLane.some(c => c.alert_type === "lane" && (c.payload as any).kind === "new_route"), "new lane");

Deno.test("computeAlertCandidates — includes live context in volume payload when provided", () => {
  const cands = computeAlertCandidates(
    { total_shipments: 30, shipments_last_12m: 30, last_shipment_date: null, top_routes: [] },
    { total_shipments: 60, shipments_last_12m: 60, last_shipment_date: null, top_routes: [] },
    {
      pod: "USLGB",
      final_dest: "Chicago, IL",
      next_arrival_date: "2026-05-25T00:00:00Z",
      drayage: { total_est_usd: 8400, total_low_usd: 6300, total_high_usd: 10500, container_count: 4 },
    },
  );
  const volume = cands.find((c) => c.alert_type === "volume");
  if (!volume) throw new Error("no volume alert");
  if ((volume.payload as any).pod !== "USLGB") throw new Error("pod missing");
  if ((volume.payload as any).drayage_est_usd !== 8400) throw new Error("drayage missing");
});

console.log("alert_diff sanity-tests passed");
