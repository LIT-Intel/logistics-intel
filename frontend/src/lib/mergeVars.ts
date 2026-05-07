// Browser/Node mirror of supabase/functions/_shared/merge-vars.ts.
// Keep these two implementations behaviorally identical — preview must
// match what the dispatcher sends.

export type MergeContext = Record<string, unknown>;

export type ApplyOptions = {
  /** What to do when a variable has no value. Default: "keep". */
  onMissing?: "keep" | "blank" | "fallback";
  /** Used when onMissing === "fallback". Defaults to empty string. */
  fallback?: string;
};

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function readVar(ctx: MergeContext, key: string): unknown {
  if (!key) return undefined;
  if (Object.prototype.hasOwnProperty.call(ctx, key)) return (ctx as any)[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(ctx)) {
    if (k.toLowerCase() === lower) return (ctx as any)[k];
  }
  if (key.includes(".")) {
    let cursor: any = ctx;
    for (const part of key.split(".")) {
      if (cursor == null) return undefined;
      cursor = cursor[part] ?? cursor[part.toLowerCase()];
    }
    return cursor;
  }
  return undefined;
}

function stringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function applyMergeVars(
  template: string | null | undefined,
  ctx: MergeContext,
  opts: ApplyOptions = {},
): string {
  if (!template) return "";
  const onMissing = opts.onMissing ?? "keep";
  const fallback = opts.fallback ?? "";

  return template.replace(TOKEN_RE, (match, raw: string) => {
    const value = readVar(ctx, raw);
    const resolved = stringify(value);
    if (resolved === "") {
      if (onMissing === "blank") return "";
      if (onMissing === "fallback") return fallback;
      return match;
    }
    return resolved;
  });
}

export function listVars(template: string | null | undefined): string[] {
  if (!template) return [];
  const seen = new Set<string>();
  for (const m of template.matchAll(TOKEN_RE)) {
    seen.add(m[1].toLowerCase());
  }
  return [...seen];
}

export function listMissingVars(
  template: string | null | undefined,
  ctx: MergeContext,
): string[] {
  return listVars(template).filter((k) => stringify(readVar(ctx, k)) === "");
}

export type RecipientLike = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  title?: string | null;
  merge_vars?: Record<string, unknown> | null;
};

export type CompanyLike = {
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  country_code?: string | null;
};

export type SenderLike = {
  email?: string | null;
  display_name?: string | null;
};

export function buildMergeContext(args: {
  recipient: RecipientLike;
  company?: CompanyLike | null;
  sender?: SenderLike | null;
  extra?: Record<string, unknown>;
}): MergeContext {
  const { recipient, company, sender, extra } = args;
  const first =
    recipient.first_name ||
    (recipient.display_name ? recipient.display_name.split(/\s+/)[0] : null) ||
    null;
  const last =
    recipient.last_name ||
    (recipient.display_name
      ? recipient.display_name.split(/\s+/).slice(1).join(" ") || null
      : null);

  const ctx: MergeContext = {
    email: recipient.email,
    first_name: first,
    last_name: last,
    full_name: [first, last].filter(Boolean).join(" ") || recipient.display_name || null,
    title: recipient.title ?? null,
    company_name: company?.name ?? null,
    company_domain: company?.domain ?? company?.website ?? null,
    company_country: company?.country_code ?? null,
    sender_name: sender?.display_name ?? null,
    sender_email: sender?.email ?? null,
    ...(recipient.merge_vars ?? {}),
    ...(extra ?? {}),
  };
  return ctx;
}
