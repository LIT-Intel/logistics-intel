import * as XLSX from 'xlsx';
import { detectFromSheets } from './schemaDetector';
import type { RfpPayload } from '@/types/rfp';
import { SYN } from './dictionaries';

export async function ingestWorkbook(file: File): Promise<RfpPayload> {
  if (file.type === 'application/json' || file.name.endsWith('.json')) {
    const text = await file.text();
    const j = JSON.parse(text);
    if (j && j.meta && j.lanes && j.rates) return j as RfpPayload;
  }
  // CSV handling: read as text; XLSX can parse string input
  let wb: XLSX.WorkBook;
  if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    wb = XLSX.read(text, { type: 'string' });
  } else {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array' });
  }
  function norm(s: any) { return String(s ?? '').trim().replace(/\s+/g,' ').toLowerCase(); }
  function scoreHeaderRow(cells: string[]): number {
    const laneKeys = Object.values(SYN.lanes).flat();
    const rateKeys = Object.values(SYN.rates).flat();
    let score = 0;
    for (const c of cells) {
      const h = norm(c);
      if (!h) continue;
      if (laneKeys.some(k => h.includes(k))) score += 2;
      if (rateKeys.some(k => h.includes(k))) score += 2;
      if (['pol','pod'].includes(h)) score += 3;
    }
    return score;
  }
  function normalizeSheet(ws: XLSX.WorkSheet) {
    // Get as array-of-arrays for robust header detection
    const a: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    // Drop completely empty rows
    const rowsA = a.filter(r => Array.isArray(r) && r.some(v => String(v).trim() !== ''));
    if (rowsA.length === 0) return [] as Record<string,any>[];
    // Pick the best header row within first 20 rows
    let bestIdx = 0; let bestScore = -1;
    const scanLimit = Math.min(rowsA.length, 20);
    for (let i=0;i<scanLimit;i++) {
      const s = scoreHeaderRow(rowsA[i].map(String));
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
    const headerCells = rowsA[bestIdx].map((v,i)=>{
      const h = String(v||'').trim();
      if (!h) return `col_${i+1}`;
      return h;
    });
    const dataRows = rowsA.slice(bestIdx+1);
    const objects: Record<string,any>[] = dataRows.map(r => {
      const obj: Record<string,any> = {};
      for (let i=0;i<headerCells.length;i++) {
        const key = headerCells[i];
        obj[key] = i < r.length ? r[i] : '';
      }
      return obj;
    }).filter(o => Object.values(o).some(v => String(v).trim() !== ''));
    return objects;
  }
  const sheets = wb.SheetNames.map((name: string) => {
    const ws = wb.Sheets[name];
    const pruned = normalizeSheet(ws);
    return { name, rows: pruned };
  });
  const payload = detectFromSheets(sheets);
  return payload;
}
