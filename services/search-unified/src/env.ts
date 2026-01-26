type BoolInput = string | undefined | null;

const toBool = (value: BoolInput) => {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const trim = (value: string | undefined | null) =>
  typeof value === "string" ? value.trim() : "";

const stripTrailingSlash = (value: string) =>
  value.endsWith("/") ? value.replace(/\/+$/, "") : value;

const IY_DMA_SEARCH_URL = stripTrailingSlash(trim(process.env.IY_DMA_SEARCH_URL));
const IY_DMA_COMPANY_BOLS_URL = stripTrailingSlash(trim(process.env.IY_DMA_COMPANY_BOLS_URL));

// Support multiple naming conventions for API key
// Try: IYApiKey (Supabase), IY_DMA_API_KEY (DMA scheme), IY_API_KEY (legacy)
const IY_DMA_API_KEY = trim(
  process.env.IYApiKey ||
  process.env.IY_DMA_API_KEY ||
  process.env.IY_API_KEY
);

const env = {
  IY_DMA_SEARCH_URL,
  IY_DMA_COMPANY_BOLS_URL,
  IY_DMA_API_KEY,
  IMPORTYETI_PRO_ENABLED: toBool(process.env.IMPORTYETI_PRO_ENABLED),
};

export default env;
