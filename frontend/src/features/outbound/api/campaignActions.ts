import { supabase } from "@/lib/supabase";

// Outbound-feature-scoped campaign actions. We keep these out of the shared
// frontend/src/lib/api.ts to honor the "don't replace api.ts wholesale" rule
// from the handoff brief while still preserving identical Supabase semantics:
// RLS-scoped writes against lit_campaigns from the authenticated browser
// session.

export type CampaignAction = "archive" | "unarchive" | "delete" | "pause" | "resume";

/**
 * Archive a campaign by flipping status to "archived". The row stays
 * resolvable for historical reads (lit_outreach_history FK still works) and
 * can be restored via unarchiveCampaign(). Preferred over delete for live
 * campaigns that have already sent outreach.
 */
export async function archiveCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("archiveCampaign: campaignId required");
  const { error } = await supabase
    .from("lit_campaigns")
    .update({ status: "archived" })
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`archiveCampaign${code}: ${error.message}`);
  }
}

export async function unarchiveCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("unarchiveCampaign: campaignId required");
  const { error } = await supabase
    .from("lit_campaigns")
    .update({ status: "draft" })
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`unarchiveCampaign${code}: ${error.message}`);
  }
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("pauseCampaign: campaignId required");
  const { error } = await supabase
    .from("lit_campaigns")
    .update({ status: "paused" })
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`pauseCampaign${code}: ${error.message}`);
  }
}

export async function resumeCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("resumeCampaign: campaignId required");
  const { error } = await supabase
    .from("lit_campaigns")
    .update({ status: "active" })
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`resumeCampaign${code}: ${error.message}`);
  }
}

/**
 * Hard-delete a campaign. Cascades through lit_campaign_companies and
 * lit_campaign_steps (FK ON DELETE CASCADE). Use only for drafts that
 * never sent — for active/paused campaigns, prefer archive.
 *
 * Outreach history rows are NOT cascaded (FK uses ON DELETE SET NULL by
 * design — historical sends survive). If you need to also drop history,
 * do that explicitly elsewhere.
 */
export async function deleteCampaign(campaignId: string): Promise<void> {
  if (!campaignId) throw new Error("deleteCampaign: campaignId required");
  const { error } = await supabase
    .from("lit_campaigns")
    .delete()
    .eq("id", campaignId);
  if (error) {
    const code = error.code ? ` ${error.code}` : "";
    throw new Error(`deleteCampaign${code}: ${error.message}`);
  }
}