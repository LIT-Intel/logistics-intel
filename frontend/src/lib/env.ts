export const API_BASE = "/api";

export function getSupabaseUrl(): string {
  try {
    const metaEnv = typeof import.meta !== "undefined" ? ((import.meta as any)?.env ?? {}) : {};
    const processEnv = typeof process !== "undefined" && process.env ? process.env : {};
    return (
      metaEnv.VITE_SUPABASE_URL ??
      processEnv.VITE_SUPABASE_URL ??
      processEnv.NEXT_PUBLIC_SUPABASE_URL ??
      ""
    ).trim();
  } catch {
    return "";
  }
}

export function getSupabaseAnonKey(): string {
  try {
    const metaEnv = typeof import.meta !== "undefined" ? ((import.meta as any)?.env ?? {}) : {};
    const processEnv = typeof process !== "undefined" && process.env ? process.env : {};
    return (
      metaEnv.VITE_SUPABASE_ANON_KEY ??
      processEnv.VITE_SUPABASE_ANON_KEY ??
      processEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      ""
    ).trim();
  } catch {
    return "";
  }
}

export const API_PROXY_BASE = API_BASE;
export function getGatewayBase(): string {
  return API_BASE;
}
