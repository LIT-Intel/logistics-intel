export function isAdmin(): boolean {
  try { return localStorage.getItem("lit:role") === "admin" || localStorage.getItem("lit:admin") === "true"; }
  catch { return false; }
}
export function plan(): "free"|"pro"|"enterprise" {
  try { return (JSON.parse(localStorage.getItem("lit:plan") || '"free"') as any) ?? "free"; }
  catch { return "free"; }
}
export function hasFeature(feature: "contacts"|"briefing"|"export"|"crm"|"campaigns"): boolean {
  if (isAdmin()) return true;
  const p = plan();
  const pro = new Set(["contacts","briefing","export","crm","campaigns"]);
  if (p === "enterprise") return true;
  if (p === "pro") return pro.has(feature);
  return feature === "campaigns"; // free can still join campaigns if we want
}
