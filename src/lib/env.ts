export function getGatewayBase(): string {
  // @ts-ignore
  const viteBase =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) || "";
  const nextBase =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE) || "";
  return viteBase || nextBase || "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";
}
