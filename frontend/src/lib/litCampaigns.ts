import { supabase } from "./supabase";

export interface LitCampaign {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: string;
  campaign_type: string;
  start_date: string | null;
  end_date: string | null;
  target_audience: any | null;
  sequence_config: any | null;
  stats: {
    total_companies?: number;
    emails_sent?: number;
    opens?: number;
    clicks?: number;
    replies?: number;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface LitCampaignCompany {
  id: string;
  campaign_id: string;
  company_id: string;
  status: string;
  stage: string;
  emails_sent: number;
  last_email_sent_at: string | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  replied_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  company?: any;
}

export async function getLitCampaigns(): Promise<LitCampaign[]> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("lit_campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []) as LitCampaign[];
}

export async function createLitCampaign(campaign: {
  name: string;
  description?: string;
  campaign_type: string;
  start_date?: string;
  end_date?: string;
  target_audience?: any;
  sequence_config?: any;
}): Promise<LitCampaign> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("lit_campaigns")
    .insert({
      user_id: session.session.user.id,
      name: campaign.name,
      description: campaign.description || null,
      campaign_type: campaign.campaign_type,
      status: "draft",
      start_date: campaign.start_date || null,
      end_date: campaign.end_date || null,
      target_audience: campaign.target_audience || null,
      sequence_config: campaign.sequence_config || null,
      stats: { total_companies: 0, emails_sent: 0, opens: 0, clicks: 0, replies: 0 },
    })
    .select()
    .single();

  if (error) throw error;

  return data as LitCampaign;
}

export async function updateLitCampaign(
  campaignId: string,
  updates: Partial<LitCampaign>
): Promise<LitCampaign> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("lit_campaigns")
    .update(updates)
    .eq("id", campaignId)
    .eq("user_id", session.session.user.id)
    .select()
    .single();

  if (error) throw error;

  return data as LitCampaign;
}

export async function deleteLitCampaign(campaignId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error("Not authenticated");
  }

  const { error } = await supabase
    .from("lit_campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("user_id", session.session.user.id);

  if (error) throw error;
}

export async function getCampaignCompanies(
  campaignId: string
): Promise<LitCampaignCompany[]> {
  const { data, error } = await supabase
    .from("lit_campaign_companies")
    .select(
      `
      *,
      company:lit_companies(*)
    `
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []) as LitCampaignCompany[];
}

export async function addCompanyToCampaign(
  campaignId: string,
  companyId: string
): Promise<LitCampaignCompany> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) {
    throw new Error("Not authenticated");
  }

  const { data: existing } = await supabase
    .from("lit_campaign_companies")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (existing) {
    throw new Error("Company already in campaign");
  }

  const { data, error } = await supabase
    .from("lit_campaign_companies")
    .insert({
      campaign_id: campaignId,
      company_id: companyId,
      status: "active",
      stage: "pending",
      emails_sent: 0,
    })
    .select(
      `
      *,
      company:lit_companies(*)
    `
    )
    .single();

  if (error) throw error;

  await updateCampaignStats(campaignId);

  return data as LitCampaignCompany;
}

export async function removeCompanyFromCampaign(
  campaignId: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase
    .from("lit_campaign_companies")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("company_id", companyId);

  if (error) throw error;

  await updateCampaignStats(campaignId);
}

export async function updateCampaignCompanyStage(
  campaignCompanyId: string,
  stage: string
): Promise<void> {
  const { error } = await supabase
    .from("lit_campaign_companies")
    .update({ stage })
    .eq("id", campaignCompanyId);

  if (error) throw error;
}

async function updateCampaignStats(campaignId: string): Promise<void> {
  const companies = await getCampaignCompanies(campaignId);

  const stats = {
    total_companies: companies.length,
    emails_sent: companies.reduce((sum, c) => sum + c.emails_sent, 0),
    opens: companies.filter((c) => c.last_opened_at).length,
    clicks: companies.filter((c) => c.last_clicked_at).length,
    replies: companies.filter((c) => c.replied_at).length,
  };

  await supabase
    .from("lit_campaigns")
    .update({ stats })
    .eq("id", campaignId);
}

export async function startCampaign(campaignId: string): Promise<void> {
  await updateLitCampaign(campaignId, {
    status: "active",
    start_date: new Date().toISOString(),
  });
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  await updateLitCampaign(campaignId, { status: "paused" });
}

export async function completeCampaign(campaignId: string): Promise<void> {
  await updateLitCampaign(campaignId, {
    status: "completed",
    end_date: new Date().toISOString(),
  });
}
