import type { CompanyCore } from '@/types/company';
import type { ContactCore } from '@/types/contacts';

const GW = (import.meta as any).env?.VITE_LIT_GATEWAY_BASE || '';

export async function enrichCompany(_payload: { company_name?: string; domain?: string }): Promise<CompanyCore> {
  // Placeholder: to be wired to `${GW}/crm/lusha/enrichCompany`
  throw new Error('enrichCompany not wired yet');
}

export async function enrichContacts(_payload: { company_name?: string; domain?: string; role_filters?: string[]; limit?: number }): Promise<ContactCore[]> {
  // Placeholder: to be wired to `${GW}/crm/lusha/enrichContacts`
  throw new Error('enrichContacts not wired yet');
}

