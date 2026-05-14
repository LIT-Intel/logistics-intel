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

console.log("alert_diff sanity-tests passed");
