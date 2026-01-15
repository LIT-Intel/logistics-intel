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

    if (lushaApiKey && company_id) {
      const { data: company } = await supabase
        .from('lit_companies')
        .select('*')
        .eq('id', company_id)
        .maybeSingle();

      if (company) {
        contacts = [];
      }
    } else {
      const mockContacts = [
        {
          full_name: 'Sarah Johnson',
          first_name: 'Sarah',
          last_name: 'Johnson',
          title: 'VP of Logistics',
          department: 'Operations',
          seniority: 'VP',
          email: 'sarah.johnson@company.com',
          phone: '+1-555-0101',
          linkedin_url: 'https://linkedin.com/in/sarahjohnson',
          city: 'Los Angeles',
          state: 'CA',
          country_code: 'US',
        },
        {
          full_name: 'Michael Chen',
          first_name: 'Michael',
          last_name: 'Chen',
          title: 'Director of Supply Chain',
          department: 'Supply Chain',
          seniority: 'Director',
          email: 'michael.chen@company.com',
          phone: '+1-555-0102',
          linkedin_url: 'https://linkedin.com/in/michaelchen',
          city: 'Los Angeles',
          state: 'CA',
          country_code: 'US',
        },
        {
          full_name: 'Emily Rodriguez',
          first_name: 'Emily',
          last_name: 'Rodriguez',
          title: 'Procurement Manager',
          department: 'Procurement',
          seniority: 'Manager',
          email: 'emily.rodriguez@company.com',
          phone: '+1-555-0103',
          linkedin_url: 'https://linkedin.com/in/emilyrodriguez',
          city: 'Los Angeles',
          state: 'CA',
          country_code: 'US',
        },
      ];

      contacts = mockContacts.filter((contact) => {
        if (department && !contact.department.toLowerCase().includes(department.toLowerCase())) return false;
        if (title && !contact.title.toLowerCase().includes(title.toLowerCase())) return false;
        if (seniority && contact.seniority !== seniority) return false;
        if (city && contact.city !== city) return false;
        if (state && contact.state !== state) return false;
        return true;
      });
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
        success: true,
        contacts: savedContacts,
        count: savedContacts.length,
        mock: !lushaApiKey,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Contact search error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});