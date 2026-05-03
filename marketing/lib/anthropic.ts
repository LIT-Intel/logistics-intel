import Anthropic from "@anthropic-ai/sdk";

/**
 * Lazy-loaded Anthropic client. Returns null when ANTHROPIC_API_KEY is
 * unset so cron endpoints can short-circuit with `if (!claude) return ...`
 * during the Phase 1B-3 window before the key lands.
 *
 * Default model: Sonnet 4.6 — best balance of cost + reasoning quality
 * for the SEO/agent workloads. Individual agents can override via the
 * `model` arg on completions.
 */
let _client: Anthropic | null = null;

export function getClaude(): Anthropic | null {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const FAST_MODEL = "claude-haiku-4-5-20251001";

export function hasClaude(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Helper: call a single-shot completion with the marketing site's
 * standard system framing. Returns the text content of the first block,
 * or null if the model didn't produce text.
 */
export async function complete({
  system,
  prompt,
  model = DEFAULT_MODEL,
  maxTokens = 2048,
  temperature = 0.4,
}: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const claude = getClaude();
  if (!claude) return null;
  const res = await claude.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : null;
}
