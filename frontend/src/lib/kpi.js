export function kpiFrom(item) {
  const shipments12m = Number(item.shipments12m ?? item.shipments_12m ?? 0);
  const rawDate = (item.lastActivity ?? item.last_activity);
  const lastActivity =
    typeof rawDate === 'string' ? rawDate :
    (rawDate && typeof rawDate.value === 'string' ? rawDate.value : null);

  const originsTop  = item.originsTop  ?? item.origins_top  ?? [];
  const destsTop    = item.destsTop    ?? item.dests_top    ?? [];
  const carriersTop = item.carriersTop ?? item.carriers_top ?? [];
  return { shipments12m, lastActivity, originsTop, destsTop, carriersTop };
}
