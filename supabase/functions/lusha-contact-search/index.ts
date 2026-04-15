import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ContactSearchRequest {
  company_id?: string;
  department?: string;
  title?: string;
  seniority?: string;
  city?: string;
  state?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lushaApiKey = Deno.env.get('LUSHA_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const body: ContactSearchRequest = await req.json();
    const { company_id, department, title, seniority, city, state } = body;

    let contacts: any[] = [];

    // Require a real Lusha API key — mock data is not permitted in production.
    if (!lushaApiKey) {
      console.error(JSON.stringify({ fn: 'lusha-contact-search', error: 'LUSHA_API_KEY not configured' }));
      return new Response(
        JSON.stringify({ ok: false, error: 'Lusha API key not configured', code: 'LUSHA_NOT_CONFIGURED' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (company_id) {
      const { data: company } = await supabase
        .from('lit_companies')
        .select('*')
        .eq('id', company_id)
        .maybeSingle();

      if (company) {
        // TODO: call Lusha prospecting API with company domain/name and filters
        // For now, return empty until Lusha API wiring is complete
        contacts = [];
      }
    }

    const savedContacts: any[] = [];

    for (const contact of contacts) {
      const sourceKey = `${contact.email || contact.full_name.replace(/\s/g, '-').toLowerCase()}`;
      
      const { data: existingContact, error: checkError } = await supabase
        .from('lit_contacts')
        .select('*')
        .eq('source', 'lusha')
        .eq('source_contact_key', sourceKey)
        .maybeSingle();

      if (!existingContact) {
        const { data: newContact, error: insertError } = await supabase
          .from('lit_contacts')
          .insert({
            source: 'lusha',
            source_contact_key: sourceKey,
            company_id,
            full_name: contact.full_name,
            first_name: contact.first_name,
            last_name: contact.last_name,
            title: contact.title,
            department: contact.department,
            seniority: contact.seniority,
            email: contact.email,
            phone: contact.phone,
            linkedin_url: contact.linkedin_url,
            city: contact.city,
            state: contact.state,
            country_code: contact.country_code,
            buying_intent: contact.buying_intent || null,
            raw_payload: contact,
          })
          .select()
          .single();

        if (!insertError && newContact) {
          savedContacts.push(newContact);
        }
      } else {
        savedContacts.push(existingContact);
      }
    }

    await supabase.from('lit_activity_events').insert({
      user_id: user.id,
      event_type: 'enrich_contacts',
      company_id,
      metadata: { count: savedContacts.length, filters: { department, title, seniority } },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        contacts: savedContacts,
        count: savedContacts.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error(JSON.stringify({ fn: 'lusha-contact-search', error: error.message }));
    return new Response(
      JSON.stringify({ ok: false, error: error.message || 'Internal server error', code: 'INTERNAL_ERROR' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});