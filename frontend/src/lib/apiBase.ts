// Resolve API base (Next.js or Vite), strip trailing slash, fallback to Cloud Run.
const readEnv = (): string | undefined => {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE) return process.env.NEXT_PUBLIC_API_BASE;
  // @ts-ignore (Vite)
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) {
    // @ts-ignore
    return import.meta.env.VITE_API_BASE as string;
  }
  return undefined;
};
const normalize = (u: string) => u.replace(/\/+$/, "");
export const API_BASE = normalize(readEnv() ?? "https://search-unified-187580267283.us-central1.run.app");

