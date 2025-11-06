export const shortId = (id?: string | null) => {
  if (id == null) return "";
  const value = typeof id === "string" ? id.trim() : String(id).trim();
  if (!value) return "";
  return value.slice(0, 8).toLowerCase();
};

export const buildGoogleMapsSearchUrl = (query?: string | null) => {
  const value = typeof query === "string" ? query.trim() : String(query ?? "").trim();
  if (!value) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
};
