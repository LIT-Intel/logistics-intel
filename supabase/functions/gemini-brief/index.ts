import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface GeminiBriefRequest {
  company_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

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

    const body: GeminiBriefRequest = await req.json();
    const { company_id } = body;

    if (!company_id) {
      throw new Error('company_id is required');
    }

    const { data: company, error: companyError } = await supabase
      .from('lit_companies')
      .select('*')
      .eq('id', company_id)
      .single();

    if (companyError || !company) {
      throw new Error('Company not found');
    }

    let briefData: any = {};

    if (geminiApiKey) {
      const prompt = `Analyze this logistics company and provide a brief pre-call summary:

Company: ${company.name}
Location: ${company.city}, ${company.state}, ${company.country_code}
Primary Mode: ${company.primary_mode || 'Unknown'}
Shipments (12m): ${company.shipments_12m || 0}
TEU (12m): ${company.teu_12m || 'N/A'}
Revenue Range: ${company.revenue_range || 'Unknown'}

Provide:
1. 3 key opportunities for sales engagement
2. 2-3 potential risks or concerns
3. 2-3 pre-call talking points

Format as JSON with keys: opportunities (array), risks (array), talking_points (array)`;

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json();
        const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (textContent) {
          try {
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              briefData = JSON.parse(jsonMatch[0]);
            } else {
              briefData = {
                opportunities: ['Analyze shipping patterns', 'Discuss volume optimization', 'Explore service expansion'],
                risks: ['Volume volatility', 'Single-mode dependency'],
                talking_points: ['Recent shipment activity', 'Market trends', 'Cost optimization'],
                raw_text: textContent,
              };
            }
          } catch {
            briefData = {
              opportunities: ['Analyze shipping patterns', 'Discuss volume optimization', 'Explore service expansion'],
              risks: ['Volume volatility'],
              talking_points: ['Recent activity', 'Market position'],
              raw_text: textContent,
            };
          }
        }
      }
    } else {
      briefData = {
        opportunities: [
          'High shipment volume indicates strong logistics needs',
          'Potential for route optimization and cost savings',
          'Opportunity to introduce additional service modes',
        ],
        risks: [
          'Market competition may be high in their sector',
          'Volume fluctuations could affect contract terms',
        ],
        talking_points: [
          `Discuss their ${company.shipments_12m || 0} shipments over last 12 months`,
          `Address ${company.primary_mode || 'primary'} logistics optimization`,
          'Explore partnership opportunities for growth',
        ],
        note: 'Gemini API not configured - using template brief',
      };
    }

    const { error: updateError } = await supabase
      .from('lit_saved_companies')
      .update({
        gemini_brief: briefData,
        gemini_brief_updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('company_id', company_id);

    if (updateError) throw updateError;

    await supabase.from('lit_activity_events').insert({
      user_id: user.id,
      event_type: 'generate_brief',
      company_id,
      metadata: { model: 'gemini-pro' },
    });

    return new Response(
      JSON.stringify({
        success: true,
        brief: briefData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Gemini brief error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});