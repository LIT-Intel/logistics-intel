// supabase/functions/bulk-import-fmcsa/fmcsa-parser.ts
//
// Parses the FMCSA SAFER bulk CSV format into structured records and
// normalizes authority type + age into the shape the icp-scorer expects.
//
// CSV format reference: FMCSA Licensing & Insurance bulk export
// https://li-public.fmcsa.dot.gov (SAFER carrier snapshot)
//
// We parse defensively: real FMCSA exports occasionally contain
// embedded commas in legal names, missing optional fields, mixed-case
// authority labels. The parser handles all three.

export interface FmcsaRow {
  legalName: string;
  dbaName: string;
  dotNumber: string;
  mcNumber: string;
  authorityTypeRaw: string;
  effectiveDate: string;
  phone: string;
  state: string;
  status: string;
}

export interface NormalizedAuthority {
  legalName: string;
  dbaName: string;
  dotNumber: string;
  mcNumber: string;
  authorityType: "broker" | "forwarder" | "both" | "carrier" | "other";
  authorityYears: number;
  state: string;
  phone: string;
  status: "active" | "inactive";
}

/**
 * Parses CSV string with RFC4180-ish handling: quoted fields can
 * contain commas, escaped quotes are doubled (""). Skips empty rows.
 */
export function parseFmcsaCsv(csv: string): FmcsaRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toUpperCase().trim());
  const colIdx = (name: string) => header.indexOf(name);

  const rows: FmcsaRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.every((p) => !p.trim())) continue;
    rows.push({
      legalName: (parts[colIdx("LEGAL_NAME")] ?? "").trim(),
      dbaName: (parts[colIdx("DBA_NAME")] ?? "").trim(),
      dotNumber: (parts[colIdx("DOT_NUMBER")] ?? "").trim(),
      mcNumber: (parts[colIdx("MC_NUMBER")] ?? "").trim(),
      authorityTypeRaw: (parts[colIdx("AUTHORITY_TYPE")] ?? "").trim(),
      effectiveDate: (parts[colIdx("EFFECTIVE_DATE")] ?? "").trim(),
      phone: (parts[colIdx("PHONE")] ?? "").trim(),
      state: (parts[colIdx("STATE")] ?? "").trim(),
      status: (parts[colIdx("STATUS")] ?? "").trim(),
    });
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') {
        inQuote = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

export function normalizeAuthority(
  row: FmcsaRow,
  now: Date
): NormalizedAuthority {
  const auth = row.authorityTypeRaw.toLowerCase();
  let authorityType: NormalizedAuthority["authorityType"];
  if (auth.includes("broker") && auth.includes("forwarder")) {
    authorityType = "both";
  } else if (auth.includes("broker")) {
    authorityType = "broker";
  } else if (auth.includes("forwarder")) {
    authorityType = "forwarder";
  } else if (auth.includes("carrier")) {
    authorityType = "carrier";
  } else {
    authorityType = "other";
  }

  const eff = new Date(row.effectiveDate);
  const ageMs = now.getTime() - eff.getTime();
  const authorityYears = isFinite(ageMs)
    ? Math.floor(ageMs / (365.25 * 86400000))
    : 0;

  const status: NormalizedAuthority["status"] =
    row.status.toUpperCase() === "ACTIVE" ? "active" : "inactive";

  return {
    legalName: row.legalName,
    dbaName: row.dbaName,
    dotNumber: row.dotNumber,
    mcNumber: row.mcNumber,
    authorityType,
    authorityYears,
    state: row.state,
    phone: row.phone,
    status,
  };
}
