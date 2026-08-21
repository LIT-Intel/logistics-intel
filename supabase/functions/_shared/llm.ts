// Dual-vendor LLM caller — single source of truth (Project Harvey).
//
// Moved out of ai-employee-console (Batch 4 refactor) so chat + writer +
// future agents share ONE caller. Behavior is identical to the original:
//   - Key resolution: OPENAI_API_KEY || ANTHROPIC_API_KEY (trimmed, quote-stripped)
//   - sk-ant-*  -> Anthropic Messages API
//   - otherwise -> OpenAI Responses API
//   - No web-search tool (chat/writer path only).
//
// Model + token defaults match the original ai-employee-console constants.

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const OPENAI_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 1024;

export type LlmResult = { ok: true; text: string } | { ok: false; error: string };

export function sanitizeKey(raw: string | undefined | null): string {
  return String(raw ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
}

/**
 * Which model id will actually be used given the resolved key. Exposed so
 * callers can record it in run/draft metadata without duplicating the sk-ant
 * detection.
 */
export function resolveLlmModel(): string | null {
  const apiKey = sanitizeKey(Deno.env.get("OPENAI_API_KEY")) ||
    sanitizeKey(Deno.env.get("ANTHROPIC_API_KEY"));
  if (!apiKey) return null;
  return apiKey.startsWith("sk-ant-") ? ANTHROPIC_MODEL : OPENAI_MODEL;
}

export async function callLlm(
  system: string,
  userText: string,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): Promise<LlmResult> {
  const apiKey = sanitizeKey(Deno.env.get("OPENAI_API_KEY")) ||
    sanitizeKey(Deno.env.get("ANTHROPIC_API_KEY"));
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY / ANTHROPIC_API_KEY not configured" };
  const useAnthropic = apiKey.startsWith("sk-ant-");

  try {
    if (useAnthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: userText }],
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `Anthropic API HTTP ${res.status}: ${t.slice(0, 240)}` };
      }
      const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
      const text = (data.content ?? [])
        .filter((b) => b?.type === "text")
        .map((b) => String(b.text ?? ""))
        .join("\n")
        .trim();
      if (!text) return { ok: false, error: "Model returned no text" };
      return { ok: true, text };
    }

    // OpenAI Responses API (single call; no web search).
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_output_tokens: maxTokens,
        instructions: system,
        input: userText,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `OpenAI API HTTP ${res.status}: ${t.slice(0, 240)}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const parts: string[] = [];
    const output = Array.isArray(data.output) ? (data.output as Array<Record<string, unknown>>) : [];
    for (const item of output) {
      if (item?.type !== "message") continue;
      const content = Array.isArray(item.content) ? (item.content as Array<Record<string, unknown>>) : [];
      for (const part of content) {
        if (part?.type === "output_text" && String(part.text ?? "").trim()) parts.push(String(part.text));
      }
    }
    if (parts.length === 0 && String(data.output_text ?? "").trim()) parts.push(String(data.output_text));
    const text = parts.join("\n").trim();
    if (!text) return { ok: false, error: "Model returned no text" };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: `LLM call threw: ${String((err as Error)?.message ?? err)}` };
  }
}
