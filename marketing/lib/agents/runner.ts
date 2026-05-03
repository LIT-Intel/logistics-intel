/**
 * Shared scaffolding for cron agent endpoints. Each endpoint is a thin
 * wrapper that:
 *   1. Verifies CRON_SECRET (or rejects 401)
 *   2. Verifies ANTHROPIC_API_KEY exists for LLM-driven agents
 *   3. Runs the agent's work function
 *   4. Returns a standard JSON envelope so monitoring + logs are uniform
 */
import type { NextRequest } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { hasClaude } from "@/lib/anthropic";

export type AgentResult = {
  agent: string;
  ok: boolean;
  durationMs: number;
  scanned?: number;
  written?: number;
  skipped?: number;
  notes?: string[];
  error?: string;
};

export async function runAgent(
  agent: string,
  req: NextRequest,
  work: () => Promise<Omit<AgentResult, "agent" | "ok" | "durationMs">>,
  opts: { requireClaude?: boolean } = {},
): Promise<Response> {
  const auth = checkCron(req);
  if (auth) return auth;

  if (opts.requireClaude && !hasClaude()) {
    return new Response(
      JSON.stringify({
        agent,
        ok: false,
        skipped: 1,
        notes: ["ANTHROPIC_API_KEY unset — agent skipped. Set the env var to enable."],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  const start = Date.now();
  try {
    const r = await work();
    const result: AgentResult = { agent, ok: true, durationMs: Date.now() - start, ...r };
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    const result: AgentResult = {
      agent,
      ok: false,
      durationMs: Date.now() - start,
      error: e?.message || String(e),
    };
    return new Response(JSON.stringify(result, null, 2), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
