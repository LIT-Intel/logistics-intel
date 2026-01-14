import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[LIT] Supabase credentials not found. Development mode may not work correctly.');
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

export type SavedCompanyRecord = {
  id: string;
  company_id: string;
  company_key: string | null;
  company_name: string;
  company_data: Record<string, any>;
  user_id: string;
  stage: string;
  source: string;
  created_at: string;
  updated_at: string;
};

export type ContactRecord = {
  id: string;
  company_id: string;
  contact_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_data: Record<string, any>;
  enriched_at: string;
  created_at: string;
};

export type CampaignRecord = {
  id: string;
  campaign_name: string;
  campaign_type: string;
  status: string;
  campaign_data: Record<string, any>;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export type CampaignCompanyRecord = {
  id: string;
  campaign_id: string;
  company_id: string;
  status: string;
  added_at: string;
};

export async function getSavedCompaniesFromSupabase(stage = 'prospect') {
  const { data, error } = await supabase
    .from('lit_saved_companies')
    .select('*')
    .eq('stage', stage)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Supabase] Error fetching saved companies:', error);
    throw error;
  }

  return { rows: data || [], total: data?.length || 0 };
}

export async function saveCompanyToSupabase(payload: {
  company_id: string;
  company_key?: string;
  company_name?: string;
  company_data?: Record<string, any>;
  stage?: string;
  source?: string;
}) {
  const companyName = payload.company_name || payload.company_data?.name || payload.company_data?.title || 'Unknown Company';

  const { data, error } = await supabase
    .from('lit_saved_companies')
    .upsert({
      company_id: payload.company_id,
      company_key: payload.company_key || payload.company_id,
      company_name: companyName,
      company_data: payload.company_data || {},
      stage: payload.stage || 'prospect',
      source: payload.source || 'importyeti',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'company_id'
    })
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Error saving company:', error);
    throw error;
  }

  return data;
}

export async function getCompanyFromSupabase(company_id: string) {
  const { data, error } = await supabase
    .from('lit_saved_companies')
    .select('*')
    .eq('company_id', company_id)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] Error fetching company:', error);
    throw error;
  }

  return data;
}

export async function deleteCompanyFromSupabase(company_id: string) {
  const { error } = await supabase
    .from('lit_saved_companies')
    .delete()
    .eq('company_id', company_id);

  if (error) {
    console.error('[Supabase] Error deleting company:', error);
    throw error;
  }

  return { success: true };
}

export async function getContactsFromSupabase(company_id: string) {
  const { data, error } = await supabase
    .from('lit_contacts')
    .select('*')
    .eq('company_id', company_id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Supabase] Error fetching contacts:', error);
    throw error;
  }

  return data || [];
}

export async function saveContactToSupabase(payload: {
  company_id: string;
  contact_name?: string;
  contact_title?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_data?: Record<string, any>;
}) {
  const { data, error } = await supabase
    .from('lit_contacts')
    .insert({
      company_id: payload.company_id,
      contact_name: payload.contact_name || null,
      contact_title: payload.contact_title || null,
      contact_email: payload.contact_email || null,
      contact_phone: payload.contact_phone || null,
      contact_data: payload.contact_data || {},
      enriched_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Error saving contact:', error);
    throw error;
  }

  return data;
}

export async function getCampaignsFromSupabase() {
  const { data, error } = await supabase
    .from('lit_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Supabase] Error fetching campaigns:', error);
    throw error;
  }

  return data || [];
}

export async function saveCampaignToSupabase(payload: {
  campaign_name: string;
  campaign_type?: string;
  status?: string;
  campaign_data?: Record<string, any>;
}) {
  const { data, error } = await supabase
    .from('lit_campaigns')
    .insert({
      campaign_name: payload.campaign_name,
      campaign_type: payload.campaign_type || 'email',
      status: payload.status || 'draft',
      campaign_data: payload.campaign_data || {},
    })
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Error saving campaign:', error);
    throw error;
  }

  return data;
}

export async function addCompanyToCampaignSupabase(payload: {
  campaign_id: string;
  company_id: string;
  status?: string;
}) {
  const { data, error } = await supabase
    .from('lit_campaign_companies')
    .insert({
      campaign_id: payload.campaign_id,
      company_id: payload.company_id,
      status: payload.status || 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Error adding company to campaign:', error);
    throw error;
  }

  return data;
}

export async function getCampaignCompaniesFromSupabase(campaign_id: string) {
  const { data, error } = await supabase
    .from('lit_campaign_companies')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order('added_at', { ascending: false });

  if (error) {
    console.error('[Supabase] Error fetching campaign companies:', error);
    throw error;
  }

  return data || [];
}
