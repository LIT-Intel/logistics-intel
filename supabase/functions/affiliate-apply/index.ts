// affiliate-apply
// Logged-in user submits / updates an affiliate program application.
// On success: creates or updates the user's pending application row.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  authenticate,
  corsHeaders,
  json,
  nonEmptyString,
  trueFlag,
} from "../_shared/affiliate.ts";

interface ApplyBody {
  full_name?: string;
  company_or_brand?: string;
  website_or_linkedin?: string;
  country?: string;
  audience_description?: string;
  audience_size?: string;
  primary_channels?: string;
  expected_referral_volume?: string;
  accepted_partner_terms?: boolean;
  accepted_stripe_ack?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { user, adminClient } = auth;

  const body = (await req.json().catch(() => ({}))) as ApplyBody;

  const fullName = nonEmptyString(body.full_name);
  const company = nonEmptyString(body.company_or_brand);
  const audienceDesc = nonEmptyString(body.audience_description);
  const channels = nonEmptyString(body.primary_channels);
  const acceptedTerms = trueFlag(body.accepted_partner_terms);
  const acceptedStripe = trueFlag(body.accepted_stripe_ack);

  const validationErrors: Record<string, string> = {};
  if (!fullName) validationErrors.full_name = "Required";
  if (!company) validationErrors.company_or_brand = "Required";
  if (!audienceDesc) validationErrors.audience_description = "Required";
  if (!channels) validationErrors.primary_channels = "Required";
  if (!acceptedTerms) validationErrors.accepted_partner_terms = "Must accept partner terms";
  if (!acceptedStripe) validationErrors.accepted_stripe_ack = "Must acknowledge Stripe payouts";

  if (Object.keys(validationErrors).length > 0) {
    return json({ ok: false, code: "VALIDATION_FAILED", errors: validationErrors }, 400);
  }

  // Block if user already has a partner record (active or suspended).
  const { data: existingPartner } = await adminClient
    .from("affiliate_partners")
    .select("id, status, ref_code")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingPartner) {
    return json(
      {
        ok: false,
        code: "ALREADY_PARTNER",
        partner: {
          id: existingPartner.id,
          status: existingPartner.status,
          ref_code: existingPartner.ref_code,
        },
      },
      409,
    );
  }

  // Update an existing pending application in place; otherwise insert new.
  const { data: existingApp } = await adminClient
    .from("affiliate_applications")
    .select("id, status")
    .eq("user_id", user.id)
    .in("status", ["pending", "approved"])
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingApp?.status === "approved") {
    // Defensive — partner row should have caught this, but in case of drift.
    return json({ ok: false, code: "ALREADY_APPROVED" }, 409);
  }

  const row = {
    user_id: user.id,
    status: "pending" as const,
    full_name: fullName,
    company_or_brand: company,
    website_or_linkedin: nonEmptyString(body.website_or_linkedin),
    country: nonEmptyString(body.country),
    audience_description: audienceDesc,
    audience_size: nonEmptyString(body.audience_size),
    primary_channels: channels,
    expected_referral_volume: nonEmptyString(body.expected_referral_volume),
    accepted_partner_terms: true,
    accepted_stripe_ack: true,
    payload: {
      submitted_via: "affiliate-apply",
      user_agent: req.headers.get("user-agent") ?? null,
    },
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let saved;
  if (existingApp?.id) {
    const { data, error } = await adminClient
      .from("affiliate_applications")
      .update(row)
      .eq("id", existingApp.id)
      .select(
        "id, status, full_name, company_or_brand, audience_description, primary_channels, submitted_at",
      )
      .maybeSingle();
    if (error) {
      console.error("[affiliate-apply] update failed", error);
      return json({ ok: false, error: "Failed to update application" }, 500);
    }
    saved = data;
  } else {
    const { data, error } = await adminClient
      .from("affiliate_applications")
      .insert(row)
      .select(
        "id, status, full_name, company_or_brand, audience_description, primary_channels, submitted_at",
      )
      .maybeSingle();
    if (error) {
      console.error("[affiliate-apply] insert failed", error);
      return json(
        {
          ok: false,
          error: "Failed to submit application",
          details: error.message,
        },
        500,
      );
    }
    saved = data;
  }

  return json({ ok: true, application: saved });
});
