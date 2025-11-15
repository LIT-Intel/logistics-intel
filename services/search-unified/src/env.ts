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
const IY_DMA_SHIPMENTS_URL = stripTrailingSlash(trim(process.env.IY_DMA_SHIPMENTS_URL));
const RFP_OWNER_DEFAULT = trim(process.env.RFP_OWNER_DEFAULT) || "vraymond@sparkfusiondigital.com";
const RFP_EMAIL_FROM = trim(process.env.RFP_EMAIL_FROM);
const RESEND_API_KEY = trim(process.env.RESEND_API_KEY);
const GCS_BUCKET = trim(process.env.GCS_BUCKET);

const env = {
  IY_DMA_SEARCH_URL,
  IY_DMA_COMPANY_BOLS_URL,
  IY_DMA_SHIPMENTS_URL,
  IY_DMA_API_KEY: trim(process.env.IY_DMA_API_KEY),
  IMPORTYETI_PRO_ENABLED: toBool(process.env.IMPORTYETI_PRO_ENABLED),
  RFP_OWNER_DEFAULT,
  RFP_EMAIL_FROM,
  RESEND_API_KEY,
  GCS_BUCKET,
};

export default env;
