import { supabase } from "@/lib/supabase";

export type ConsentSource =
  | "saved_company_picker"
  | "manual_email_tab"
  | "csv_upload"
  | "crm_sync";

interface UpsertConsentsArgs {
  emails: string[];
  orgId: string;
  attestedByUserId: string;
  source: ConsentSource;
  campaignId?: string | null;
}

export async function upsertConsents(args: UpsertConsentsArgs): Promise<void> {
  if (!args.emails.length) return;

  const seen = new Set<string>();
  const rows: Array<{
    recipient_email: string;
    org_id: string;
    attested_by_user_id: string;
    source: ConsentSource;
    campaign_id: string | null;
  }> = [];

  for (const raw of args.emails) {
    const lower = raw.toLowerCase().trim();
    if (!lower || seen.has(lower)) continue;
    seen.add(lower);
    rows.push({
      recipient_email: lower,
      org_id: args.orgId,
      attested_by_user_id: args.attestedByUserId,
      source: args.source,
      campaign_id: args.campaignId ?? null,
    });
  }

  if (!rows.length) return;

  const { error } = await supabase
    .from("lit_recipient_consent")
    .upsert(rows, { onConflict: "recipient_email,org_id", ignoreDuplicates: true });
  if (error) {
    console.warn("[recipientConsent] upsert failed:", error.message);
    throw new Error(`Consent upsert failed: ${error.message}`);
  }
}
