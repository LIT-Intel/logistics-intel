import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface SaveCompanyRequest {
  company_id?: string;
  source_company_key?: string;
  company_data?: any;
  stage?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error(JSON.stringify({ fn: 'save-company', requestId, error: 'Missing authorization header' }));
      return new Response(
        JSON.stringify({ ok: false, error: 'Authorization header is required', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error(JSON.stringify({ fn: 'save-company', requestId, error: 'Unauthorized', detail: userError?.message }));
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body: SaveCompanyRequest = await req.json();
    const { company_id, source_company_key, company_data, stage = 'prospect' } = body;

    console.log(JSON.stringify({ fn: 'save-company', requestId, user_id: user.id, company_id: company_id ?? null, source_company_key: source_company_key ?? null, stage, ts: new Date().toISOString() }));

    if (!company_id && !source_company_key) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Either company_id or source_company_key is required', code: 'INVALID_INPUT' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let companyRecord;

    if (company_id) {
      const { data, error } = await supabase
        .from('lit_companies')
        .select('*')
        .eq('id', company_id)
        .maybeSingle();

      if (error) throw error;
      companyRecord = data;
    } else if (source_company_key) {
      const { data, error } = await supabase
        .from('lit_companies')
        .select('*')
        .eq('source_company_key', source_company_key)
        .maybeSingle();

      if (error) throw error;
      companyRecord = data;
    }

    if (!companyRecord && company_data) {
      const { data, error } = await supabase
        .from('lit_companies')
        .insert({
          source: company_data.source || 'importyeti',
          source_company_key: company_data.source_company_key || source_company_key,
          name: company_data.name,
          normalized_name: company_data.name?.toLowerCase(),
          domain: company_data.domain,
          website: company_data.website,
          phone: company_data.phone,
          country_code: company_data.country_code,
          address_line1: company_data.address_line1 || company_data.address,
          city: company_data.city,
          state: company_data.state,
          postal_code: company_data.postal_code,
          shipments_12m: company_data.shipments_12m || 0,
          teu_12m: company_data.teu_12m,
          fcl_shipments_12m: company_data.fcl_shipments_12m,
          lcl_shipments_12m: company_data.lcl_shipments_12m,
          est_spend_12m: company_data.est_spend_12m,
          most_recent_shipment_date: company_data.most_recent_shipment_date,
          top_route_12m: company_data.top_route_12m,
          recent_route: company_data.recent_route,
          tags: company_data.tags || [],
          primary_mode: company_data.primary_mode || company_data.mode,
          revenue_range: company_data.revenue_range,
          risk_level: company_data.risk_level,
          raw_profile: company_data.raw_profile,
          raw_stats: company_data.raw_stats,
          raw_last_search: company_data,
        })
        .select()
        .single();

      if (error) throw error;
      companyRecord = data;
    }

    if (!companyRecord) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Company not found and no data provided to create it', code: 'COMPANY_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const now = new Date().toISOString();

    const { data: savedCompany, error: saveError } = await supabase
      .from('lit_saved_companies')
      .upsert({
        user_id: user.id,
        company_id: companyRecord.id,
        stage,
        last_activity_at: now,
        last_viewed_at: now,
      }, {
        onConflict: 'user_id,company_id',
      })
      .select()
      .single();

    if (saveError) throw saveError;

    await supabase
      .from('lit_activity_events')
      .insert({
        user_id: user.id,
        event_type: 'company_saved',
        company_id: companyRecord.id,
        metadata: {
          description: `Saved ${companyRecord.name} to Command Center`,
          company_name: companyRecord.name,
        },
      });

    return new Response(
      JSON.stringify({
        ok: true,
        success: true,
        data: {
          company: companyRecord,
          saved: savedCompany,
        },
        company: companyRecord,
        saved: savedCompany,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Save company error:', {
      requestId,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      stack: error.stack,
    });

    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
        message: error.message || 'Internal server error',
        details: error.details || null,
        hint: error.hint || null,
        code: error.code || null,
      }),
      {
        status: error.code === '23505' ? 409 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
