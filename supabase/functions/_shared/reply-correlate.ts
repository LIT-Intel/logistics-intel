// supabase/functions/_shared/reply-correlate.ts

export type CorrelateInput = {
  inReplyTo: string | null;
  references: string | null;
};

/**
 * Extracts message-IDs from RFC 5322 reply headers, ordered with the
 * most recent first (In-Reply-To takes priority; References is a chain).
 * De-duplicates while preserving order.
 *
 * Caller queries lit_outreach_history.provider_event_id IN (...) to
 * find the original outbound message this reply belongs to.
 */
export function correlateReplyHeaders(input: CorrelateInput): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  function add(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    ids.push(trimmed);
  }

  if (input.inReplyTo) add(input.inReplyTo);

  if (input.references) {
    // References is a space-separated list of <id> tokens.
    for (const token of input.references.split(/\s+/)) {
      if (token.startsWith("<") && token.endsWith(">")) {
        add(token);
      }
    }
  }

  return ids;
}
