// POST /api/unsubscribe?token=<48-char hex>
// One-click unsubscribe per RFC 8058 (List-Unsubscribe-Post compatible).
// Calls SECURITY DEFINER RPC `unsubscribe_by_token` via the anon key —
// the RPC handles privilege escalation server-side. No service-role
// credentials required in Vercel.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest)  { return handle(req); }

async function handle(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token || token.length < 16) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !anon) {
    console.error("[unsubscribe] missing supabase public env vars");
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const supabase = createClient(url, anon);
  const { data, error } = await supabase.rpc("unsubscribe_by_token", { p_token: token });

  if (error) {
    console.error("[unsubscribe] rpc failed:", error.message);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
  if (!data || (data as any).ok !== true) {
    return NextResponse.json({ ok: false, error: (data as any)?.error || "unknown" }, { status: 400 });
  }

  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;text-align:center;padding:48px;">
       <h1 style="color:#0F172A;">You're unsubscribed</h1>
       <p style="color:#64748B;">You won't receive any more Pulse digest emails. You can resubscribe anytime from your <a href="https://app.logisticintel.com/app/notifications">notification preferences</a>.</p>
     </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
}
