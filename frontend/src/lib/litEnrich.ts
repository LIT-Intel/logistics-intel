import { toast } from 'sonner';

export async function enrichCompany(input: { name: string; domain?: string|null }) {
  const r = await fetch("/api/lit/public/enrichCompany", {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify(input),
  });
  if (r.status === 404) {
    toast.info("Enrichment service not enabled for this environment yet. We’ll use available public signals.");
    // return input back as-is so caller can proceed without blocking
    return { company_id: null, name: input.name, domain: input.domain ?? null };
  }
  if (!r.ok) throw new Error(String(r.status));
  return r.json(); // expected: { company_id, name, domain? }
}
