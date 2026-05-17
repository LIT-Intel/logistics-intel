const MAP: Record<string, "maersk" | "hapag"> = {
  MAEU: "maersk", SUDU: "maersk", SAFM: "maersk", MCPU: "maersk",
  HLCU: "hapag",  HLXU: "hapag",
};

export type SupportedCarrier = "maersk" | "hapag";

export function routeBySCAC(scac: string | null | undefined): SupportedCarrier | null {
  if (!scac) return null;
  return MAP[String(scac).toUpperCase()] ?? null;
}

export function isSupportedSCAC(scac: string | null | undefined): boolean {
  return routeBySCAC(scac) !== null;
}
