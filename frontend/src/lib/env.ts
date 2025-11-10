export function getGatewayBase(): string {
  // Vite during build → import.meta.env.VITE_API_BASE
  // Fallback to NEXT_PUBLIC_API_BASE at runtime
  // Final fallback to the current Gateway URL
  // @ts-ignore
  const viteBase = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) || "";
  const nextBase = (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_API_BASE) || "";
  return viteBase || nextBase || "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";
}
