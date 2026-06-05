// supabase/functions/bulk-import-fmcsa/apollo-client.ts
//
// Thin Apollo REST wrapper. Three operations the FMCSA pipeline needs:
//   - findCompanyByDomain(domain) → orgId | null
//   - findContactsAtCompany(orgId, titleAllowlist) → Contact[]
//   - unlockContactEmail(contactId) → { email, deliverable }
//
// Why not the MCP: the MCP is design-time. At pipeline runtime in a
// Supabase edge function we need direct REST with our own retry/error
// handling. The MCP can still be used for ad-hoc exploration in dev.
//
// Env: APOLLO_API_KEY (Supabase secret). Pro plan rate limits apply.

const APOLLO_BASE = "https://api.apollo.io/api/v1";

export interface ApolloContact {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string | null;
  emailStatus: string | null; // "verified" | "likely to engage" | etc.
  linkedinUrl: string | null;
}

export interface ApolloCompany {
  id: string;
  name: string;
  domain: string | null;
  employeeCount: number | null;
}

export function makeApolloClient(apiKey: string) {
  const headers = {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
  };

  async function findCompanyByDomain(domain: string): Promise<ApolloCompany | null> {
    if (!domain) return null;
    const res = await fetch(`${APOLLO_BASE}/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
      method: "GET",
      headers,
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Apollo enrich ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
    }
    const json = await res.json();
    const org = json?.organization;
    if (!org?.id) return null;
    return {
      id: org.id,
      name: org.name || "",
      domain: org.primary_domain || null,
      employeeCount: typeof org.estimated_num_employees === "number" ? org.estimated_num_employees : null,
    };
  }

  async function findContactsAtCompany(orgId: string): Promise<ApolloContact[]> {
    // People search filtered to a specific organization, decision-maker titles.
    const body = {
      organization_ids: [orgId],
      person_titles: [
        "president", "ceo", "owner", "founder", "managing partner",
        "vp sales", "vp business development", "vp operations",
        "director of sales", "director of business development",
        "director of operations", "director of logistics",
        "sales manager", "business development manager", "sales operations manager",
      ],
      page: 1,
      per_page: 10,
    };
    const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Apollo people search ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
    }
    const json = await res.json();
    const people = Array.isArray(json?.people) ? json.people : [];
    return people.map((p: any) => ({
      id: p.id,
      firstName: p.first_name || "",
      lastName: p.last_name || "",
      title: p.title || "",
      email: p.email || null,
      emailStatus: p.email_status || null,
      linkedinUrl: p.linkedin_url || null,
    }));
  }

  async function unlockContactEmail(contactId: string): Promise<{ email: string | null; deliverable: boolean }> {
    // Apollo's "reveal" endpoint - consumes 1 credit. Returns email even if
    // it was visible in search results (idempotent on already-unlocked).
    const res = await fetch(`${APOLLO_BASE}/people/match`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: contactId, reveal_personal_emails: false }),
    });
    if (!res.ok) {
      throw new Error(`Apollo unlock ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
    }
    const json = await res.json();
    const person = json?.person;
    const email = person?.email || null;
    const status = (person?.email_status || "").toLowerCase();
    const deliverable = email !== null && (status === "verified" || status === "likely to engage");
    return { email, deliverable };
  }

  return { findCompanyByDomain, findContactsAtCompany, unlockContactEmail };
}
