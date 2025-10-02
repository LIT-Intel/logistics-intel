import * as XLSX from 'xlsx';
import { detectFromSheets } from './schemaDetector';
import type { RfpPayload } from '@/types/rfp';

export async function ingestWorkbook(file: File): Promise<RfpPayload> {
  if (file.type === 'application/json' || file.name.endsWith('.json')) {
    const text = await file.text();
    const j = JSON.parse(text);
    if (j && j.meta && j.lanes && j.rates) return j as RfpPayload;
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets = wb.SheetNames.map((name: string) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false }) as Record<string, any>[];
    const pruned = rows.filter((r: Record<string,any>) => Object.values(r).some((v: any) => v !== null && String(v).trim() !== ''));
    return { name, rows: pruned };
  });
  const payload = detectFromSheets(sheets);
  return payload;
}
