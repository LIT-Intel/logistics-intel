// supabase/functions/_shared/canonical_name.ts
const SUFFIX_RE = /\s+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|limited|sas|gmbh)$/i;

export function canonicalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(SUFFIX_RE, "")
    .replace(/[.,'"!?()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
