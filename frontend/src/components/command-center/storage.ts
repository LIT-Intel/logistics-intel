export type SavedCompany = { company_id?: string|null; name: string; domain?: string|null; source:"LIT"|"MANUAL"|"LUSHA"|"APOLLO"; ts:number; archived?: boolean };

function readLegacySaved(): Array<{ id?: string; name?: string; savedAt?: number }>|[] {
  try { return JSON.parse(localStorage.getItem('lit_companies') || '[]'); } catch { return []; }
}

export function loadSaved(): SavedCompany[] {
  try {
    const primary: SavedCompany[] = JSON.parse(localStorage.getItem("lit:savedCompanies")||"[]");
    const legacy = readLegacySaved();
    const mappedLegacy: SavedCompany[] = (Array.isArray(legacy) ? legacy : []).map((c) => ({
      company_id: (c.id ?? null) as any,
      name: String(c.name || '').trim() || 'Company',
      domain: null,
      source: 'LIT',
      ts: Number(c.savedAt || Date.now()),
      archived: false,
    }));
    const byKey = new Map<string, SavedCompany>();
    for (const item of [...mappedLegacy, ...primary]) {
      const key = String((item.company_id ?? item.name) || '').toLowerCase();
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, item);
    }
    return Array.from(byKey.values());
  } catch {
    return [];
  }
}
export function saveSaved(list: SavedCompany[]) {
  localStorage.setItem("lit:savedCompanies", JSON.stringify(list));
  // Write minimal legacy entries so Search page can reflect saved state
  try {
    const legacy = list.map((c) => ({ id: c.company_id ?? `name:${c.name.toLowerCase()}`, name: c.name, savedAt: c.ts || Date.now() }));
    localStorage.setItem('lit_companies', JSON.stringify(legacy));
  } catch {}
}
export function upsertSaved(entry: SavedCompany) {
  const list = loadSaved().filter(x => (x.company_id ?? x.name) !== (entry.company_id ?? entry.name));
  const withTs = { ...entry, ts: entry.ts ?? Date.now() } as SavedCompany;
  saveSaved([withTs, ...list]);
}
export function toggleArchive(key: { company_id?: string|null; name: string }, archived: boolean) {
  const list = loadSaved().map(x =>
    ((x.company_id ?? x.name) === (key.company_id ?? key.name)) ? { ...x, archived } : x
  );
  saveSaved(list);
}
