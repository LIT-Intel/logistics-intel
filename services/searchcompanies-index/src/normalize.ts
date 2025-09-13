import { z } from "zod";

const ModeEnum = z.enum(["all","ocean","air"]).default("all");

const Pagination = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
}).default({ limit: 25, offset: 0 });

const DateRange = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
}).optional();

const Filters = z.record(z.any()).default({});

const Normalized = z.object({
  data: z.object({
    search: z.object({
      q: z.string(),
      mode: ModeEnum,
    }),
    filters: Filters,
    dateRange: DateRange,
    pagination: Pagination,
  }),
});

// Input shapes
const Shape1 = z.object({
  q: z.string().optional(),
  mode: z.union([z.literal("ocean"), z.literal("air"), z.literal("all")]).optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
}).strict();

const Shape2 = z.object({
  search: z.object({ q: z.string().optional(), mode: ModeEnum.optional() }).optional(),
  pagination: z.object({ limit: z.number().int().optional(), offset: z.number().int().optional() }).optional(),
  filters: z.record(z.any()).optional(),
  dateRange: DateRange.optional(),
}).strict();

const Shape3 = z.object({ data: Shape2 }).strict();

export type NormalizedType = z.infer<typeof Normalized>;

export function normalizeSearchCompaniesInput(input: unknown): NormalizedType {
  // Try shapes 3,2,1 in order of nesting
  let s3: any | null = null;
  let s2: any | null = null;
  let s1: any | null = null;

  const issueErrors: string[] = [];

  try { s3 = Shape3.parse(input); } catch (e) { s3 = null; }
  if (!s3) {
    try { s2 = Shape2.parse(input); } catch (e) { s2 = null; }
  }
  if (!s3 && !s2) {
    try { s1 = Shape1.parse(input); } catch (e) { s1 = null; }
  }

  let q = ""; let mode: "all"|"ocean"|"air" = "all"; let filters: Record<string, any> = {}; let dateRange: { from: string; to: string } | undefined; let limit = 25; let offset = 0;

  if (s3) {
    const d = s3.data || {};
    q = d.search?.q ?? "";
    mode = (d.search?.mode as any) ?? "all";
    filters = d.filters ?? {};
    dateRange = d.dateRange;
    limit = d.pagination?.limit ?? 25;
    offset = d.pagination?.offset ?? 0;
  } else if (s2) {
    q = s2.search?.q ?? "";
    mode = (s2.search?.mode as any) ?? "all";
    filters = s2.filters ?? {};
    dateRange = s2.dateRange;
    limit = s2.pagination?.limit ?? 25;
    offset = s2.pagination?.offset ?? 0;
  } else if (s1) {
    q = s1.q ?? "";
    mode = (s1.mode as any) ?? "all";
    limit = s1.limit ?? 25;
    offset = s1.offset ?? 0;
  } else {
    // None matched → build helpful error via zod compose to get fieldErrors
    const union = z.union([Shape3, Shape2, Shape1]);
    const parsed = union.safeParse(input);
    const flat = (parsed as any).error?.flatten?.();
    const fieldErrors = flat ? ({ ...flat.fieldErrors } as Record<string, string[]>) : undefined;
    const err: any = new Error("invalid_input");
    err.status = 422;
    if (fieldErrors) err.fieldErrors = fieldErrors;
    throw err;
  }

  // Coerce mode default
  if (!(["all","ocean","air"] as const).includes(mode)) mode = "all";

  const normalized = Normalized.parse({
    data: {
      search: { q, mode },
      filters,
      dateRange,
      pagination: { limit, offset },
    },
  });
  return normalized;
}

