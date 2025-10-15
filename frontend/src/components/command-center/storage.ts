export type SavedCompany = { company_id?: string|null; name: string; domain?: string|null; source:"LIT"|"MANUAL"; ts:number; archived?: boolean };

export function loadSaved(): SavedCompany[] {
  try { return JSON.parse(localStorage.getItem("lit:savedCompanies")||"[]"); } catch { return []; }
}
export function saveSaved(list: SavedCompany[]) {
  localStorage.setItem("lit:savedCompanies", JSON.stringify(list));
}
export function upsertSaved(entry: SavedCompany) {
  const list = loadSaved().filter(x => (x.company_id ?? x.name) !== (entry.company_id ?? entry.name));
  saveSaved([entry, ...list]);
}
export function toggleArchive(key: { company_id?: string|null; name: string }, archived: boolean) {
  const list = loadSaved().map(x =>
    ((x.company_id ?? x.name) === (key.company_id ?? key.name)) ? { ...x, archived } : x
  );
  saveSaved(list);
}
