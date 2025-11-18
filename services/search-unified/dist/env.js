const toBool = (value) => {
    if (typeof value !== "string")
        return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
};
const trim = (value) => typeof value === "string" ? value.trim() : "";
const stripTrailingSlash = (value) => value.endsWith("/") ? value.replace(/\/+$/, "") : value;
const IY_DMA_SEARCH_URL = stripTrailingSlash(trim(process.env.IY_DMA_SEARCH_URL));
const IY_DMA_COMPANY_BOLS_URL = stripTrailingSlash(trim(process.env.IY_DMA_COMPANY_BOLS_URL));
const env = {
    IY_DMA_SEARCH_URL,
    IY_DMA_COMPANY_BOLS_URL,
    IY_DMA_API_KEY: trim(process.env.IY_DMA_API_KEY),
    IMPORTYETI_PRO_ENABLED: toBool(process.env.IMPORTYETI_PRO_ENABLED),
};
export default env;
