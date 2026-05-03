/** Locale-stable date formatter so SSR + hydration match. */
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  try {
    return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatNumber(n: number | string | null | undefined) {
  if (n === null || n === undefined) return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US").format(num);
}
