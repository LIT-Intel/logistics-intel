export async function enrichCompany(input: { name: string; domain?: string|null }) {
  const r = await fetch("/api/lit/public/enrichCompany", {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json(); // expected: { company_id, name, domain? }
}
