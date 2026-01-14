import { createClient } from '@supabase/supabase-js';

let supabaseClient: any = null;
let supabaseError: Error | null = null;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

try {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[LIT] Supabase credentials not found. Development mode will use fallback storage.');
    supabaseError = new Error('Supabase credentials not configured');
  } else {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    console.info('[LIT] Supabase client initialized successfully');
  }
} catch (error) {
  console.warn('[LIT] Supabase client could not be initialized. Using fallback storage.', error);
  supabaseError = error as Error;
}

function createMockSupabaseResponse() {
  return { data: [], error: null };
}

function createMockSupabaseClient() {
  const mockChain = {
    select: () => mockChain,
    eq: () => mockChain,
    order: () => mockChain,
    maybeSingle: () => createMockSupabaseResponse(),
    single: () => ({ data: null, error: new Error('Supabase not available') }),
    insert: () => mockChain,
    upsert: () => mockChain,
    delete: () => ({ error: new Error('Supabase not available') }),
    ...createMockSupabaseResponse(),
  };

  return {
    from: () => mockChain
  };
}

export const supabase = supabaseClient || createMockSupabaseClient();

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
  try {
    if (supabaseError) {
      console.warn('[Supabase] Client not available, returning empty results');
      return { rows: [], total: 0 };
    }

    const { data, error } = await supabase
      .from('lit_saved_companies')
      .select('*')
      .eq('stage', stage)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase] Error fetching saved companies:', error);
      return { rows: [], total: 0 };
    }

    return { rows: data || [], total: data?.length || 0 };
  } catch (error) {
    console.warn('[Supabase] Exception fetching saved companies:', error);
    return { rows: [], total: 0 };
  }
}

export async function saveCompanyToSupabase(payload: {
  company_id: string;
  company_key?: string;
  company_name?: string;
  company_data?: Record<string, any>;
  stage?: string;
  source?: string;
}) {
  try {
    if (supabaseError) {
      console.warn('[Supabase] Client not available, cannot save company. Using localStorage fallback.');
      const saved = {
        id: `local-${Date.now()}`,
        company_id: payload.company_id,
        company_key: payload.company_key || payload.company_id,
        company_name: payload.company_name || payload.company_data?.name || 'Unknown Company',
        company_data: payload.company_data || {},
        stage: payload.stage || 'prospect',
        source: payload.source || 'importyeti',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: 'local-user',
      };

      const stored = JSON.parse(localStorage.getItem('lit_saved_companies') || '[]');
      const existing = stored.findIndex((c: any) => c.company_id === payload.company_id);
      if (existing >= 0) {
        stored[existing] = saved;
      } else {
        stored.push(saved);
      }
      localStorage.setItem('lit_saved_companies', JSON.stringify(stored));

      return saved;
    }

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
      console.warn('[Supabase] Error saving company, using localStorage fallback:', error);
      const saved = {
        id: `local-${Date.now()}`,
        company_id: payload.company_id,
        company_key: payload.company_key || payload.company_id,
        company_name: companyName,
        company_data: payload.company_data || {},
        stage: payload.stage || 'prospect',
        source: payload.source || 'importyeti',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: 'local-user',
      };

      const stored = JSON.parse(localStorage.getItem('lit_saved_companies') || '[]');
      const existing = stored.findIndex((c: any) => c.company_id === payload.company_id);
      if (existing >= 0) {
        stored[existing] = saved;
      } else {
        stored.push(saved);
      }
      localStorage.setItem('lit_saved_companies', JSON.stringify(stored));

      return saved;
    }

    return data;
  } catch (error) {
    console.warn('[Supabase] Exception saving company:', error);
    throw error;
  }
}

export async function getCompanyFromSupabase(company_id: string) {
  try {
    if (supabaseError) {
      const stored = JSON.parse(localStorage.getItem('lit_saved_companies') || '[]');
      return stored.find((c: any) => c.company_id === company_id) || null;
    }

    const { data, error } = await supabase
      .from('lit_saved_companies')
      .select('*')
      .eq('company_id', company_id)
      .maybeSingle();

    if (error) {
      console.warn('[Supabase] Error fetching company:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('[Supabase] Exception fetching company:', error);
    return null;
  }
}

export async function deleteCompanyFromSupabase(company_id: string) {
  try {
    if (supabaseError) {
      const stored = JSON.parse(localStorage.getItem('lit_saved_companies') || '[]');
      const filtered = stored.filter((c: any) => c.company_id !== company_id);
      localStorage.setItem('lit_saved_companies', JSON.stringify(filtered));
      return { success: true };
    }

    const { error } = await supabase
      .from('lit_saved_companies')
      .delete()
      .eq('company_id', company_id);

    if (error) {
      console.warn('[Supabase] Error deleting company:', error);
    }

    return { success: true };
  } catch (error) {
    console.warn('[Supabase] Exception deleting company:', error);
    return { success: false };
  }
}

export async function getContactsFromSupabase(company_id: string) {
  try {
    if (supabaseError) {
      return [];
    }

    const { data, error } = await supabase
      .from('lit_contacts')
      .select('*')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase] Error fetching contacts:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.warn('[Supabase] Exception fetching contacts:', error);
    return [];
  }
}

export async function saveContactToSupabase(payload: {
  company_id: string;
  contact_name?: string;
  contact_title?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_data?: Record<string, any>;
}) {
  try {
    if (supabaseError) {
      return null;
    }

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
      console.warn('[Supabase] Error saving contact:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('[Supabase] Exception saving contact:', error);
    return null;
  }
}

export async function getCampaignsFromSupabase() {
  try {
    if (supabaseError) {
      return [];
    }

    const { data, error } = await supabase
      .from('lit_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase] Error fetching campaigns:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.warn('[Supabase] Exception fetching campaigns:', error);
    return [];
  }
}

export async function saveCampaignToSupabase(payload: {
  campaign_name: string;
  campaign_type?: string;
  status?: string;
  campaign_data?: Record<string, any>;
}) {
  try {
    if (supabaseError) {
      return null;
    }

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
      console.warn('[Supabase] Error saving campaign:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('[Supabase] Exception saving campaign:', error);
    return null;
  }
}

export async function addCompanyToCampaignSupabase(payload: {
  campaign_id: string;
  company_id: string;
  status?: string;
}) {
  try {
    if (supabaseError) {
      return null;
    }

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
      console.warn('[Supabase] Error adding company to campaign:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('[Supabase] Exception adding company to campaign:', error);
    return null;
  }
}

export async function getCampaignCompaniesFromSupabase(campaign_id: string) {
  try {
    if (supabaseError) {
      return [];
    }

    const { data, error } = await supabase
      .from('lit_campaign_companies')
      .select('*')
      .eq('campaign_id', campaign_id)
      .order('added_at', { ascending: false });

    if (error) {
      console.warn('[Supabase] Error fetching campaign companies:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.warn('[Supabase] Exception fetching campaign companies:', error);
    return [];
  }
}
