import { toast } from "sonner";

export async function enrichCompany(input: { name: string; domain?: string|null }) {
  const r = await fetch("/api/lit/public/enrichCompany", {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify(input),
  });

  // Backend not deployed yet → degrade gracefully
  if (r.status === 404) {
    toast.info("Enrichment service is not enabled in this environment yet. Using public signals only.");
    // Return a passthrough object so caller can keep going
    return { company_id: null, name: input.name, domain: input.domain ?? null };
  }

  if (!r.ok) {
    const msg = await safeText(r);
    throw new Error(msg || String(r.status));
  }

  return r.json(); // expected: { company_id, name, domain? }
}

async function safeText(res: Response) {
  try { return await res.text(); } catch { return ""; }
}
