export function bolPage(input: { limit?: unknown; offset?: unknown } = {}) {
  const integer = (value: unknown, fallback: number) => {
    const n = Number(value);
    return value == null || !Number.isFinite(n) ? fallback : Math.floor(n);
  };
  return { limit: Math.min(500, Math.max(1, integer(input.limit, 250))), offset: Math.max(0, integer(input.offset, 0)) };
}

export function bolPageResponse(rows: unknown[], raw: any, limit: number, offset: number) {
  const candidate = raw?.total ?? raw?.total_count ?? raw?.pagination?.total;
  const total = candidate != null && Number.isFinite(Number(candidate)) && Number(candidate) >= 0 ? Number(candidate) : null;
  return { ok: true, rows, total, returned_count: rows.length, offset, limit,
    has_more: total == null ? rows.length > 0 : offset + rows.length < total,
    next_offset: rows.length ? offset + rows.length : null,
    coverage: total == null ? 'unknown' : 'provider-reported', source: 'importyeti' };
}
