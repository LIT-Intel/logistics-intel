// Resolve API base at runtime from Next.js or Vite, with a safe default.
// Also normalize by stripping any trailing slash.

const readEnv = (): string | undefined => {
  // Next.js / Node
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }
  // Vite
  // @ts-ignore import.meta is a Vite thing; ignore in Next builds
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) {
    // allow VITE_API_BASE as a secondary knob if needed
    // @ts-ignore
    return import.meta.env.VITE_API_BASE as string;
  }
  return undefined;
};

const normalize = (url: string) => url.replace(/\/+$/, "");

export const API_BASE =
  normalize(
    readEnv() ??
      "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev"
  );

export const getGatewayBase = () => API_BASE;
