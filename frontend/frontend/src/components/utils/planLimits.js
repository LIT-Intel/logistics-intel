export function getPlanLimits(plan) {
  const p = (plan||"free").toLowerCase();
  if(p==="enterprise") return { users:2000, outreachPerDay:10000, enrichPerMonth:200000 };
  if(p==="pro") return { users:50, outreachPerDay:500, enrichPerMonth:5000 };
  return { users:3, outreachPerDay:50, enrichPerMonth:100 };
}
export default getPlanLimits;
