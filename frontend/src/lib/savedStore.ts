import { CommandCenterRecord } from '@/types/importyeti';

const KEY = 'lit.savedCompanies.v1';

export function getLocalSaved(): CommandCenterRecord[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushLocalSaved(record: CommandCenterRecord) {
  if (typeof window === 'undefined') return;
  const existing = getLocalSaved();
  const deduped = existing.filter((item) => item.company.company_id !== record.company.company_id);
  deduped.unshift(record);
  window.localStorage.setItem(KEY, JSON.stringify(deduped));
}

export function removeLocalSaved(companyId: string) {
  if (typeof window === 'undefined') return;
  const existing = getLocalSaved();
  const filtered = existing.filter((item) => item.company.company_id !== companyId);
  window.localStorage.setItem(KEY, JSON.stringify(filtered));
}
